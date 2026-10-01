---
id: 4013b
status: closed
created_at: 2026-10-01T01:20:02.656Z
updated_at: 2026-10-01T01:22:56.849Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-10-01T01:20:25.748Z
closed_at: 2026-10-01T01:22:56.849Z
---

# 运行体上下文压缩：把旧轮次摘要进 checkpoint 与会话历史

## Background

`RunBudget`（默认 `max_tokens=100_000` / `max_turns=24` / `max_cost_usd=5.0`）到点**硬停**：长会话在 token 预算耗尽时只会收到 `BUDGET_EXCEEDED` 并结束，没有任何压缩。上一个工单已经把上下文同时写进 checkpoint（续跑用）与会话历史（只读），两套真相不能混用——**resume 只从 checkpoint 恢复**。

本 Issue 只改 `agent-core`：上下文超阈值时用注入的 `ModelProvider` 生成摘要，压缩后续模型请求的上下文，并把压缩结果持久化到 checkpoint 与会话历史，使 resume 后上下文与压缩前一致。

**阈值与估算假设（本包没有 tokenizer）**

- `estimate_tokens(message) = 4 + ceil((len(content) + len(tool_calls 文本)) / chars_per_token)`，默认 `chars_per_token = 3`。
- 3 chars/token 落在英文（≈4）与中文（≈1）之间，对英文**故意高估**，因此压缩更早触发——对预算保护是保守方向。
- 触发阈值默认 `max(256, int(max_tokens * 0.5))`，从 `RunBudget.max_tokens` 派生；可用 `CompactionPolicy.max_context_tokens`（CLI `--compact-above-tokens`）覆盖。
- 保留最近 `keep_recent_turns = 4` 轮（一个「轮」= 一条 assistant 消息及其后的 tool 结果）；上下文少于 `min_messages = 6` 时不压缩。

**压缩承载方式（role / 标记）**

- 模型上下文：被摘要的 `messages[1:cut]` 折叠成一条 **role=`system`** 的消息，内容以固定标记 `[compacted-history]` 开头。
- 会话历史：追加一条 **role=`system`** 的行，`content` 为消息 wire 加上 `"compactedHistory": true` 与 `"compactedMessages": N`；不改后端 schema。
- 会话 seq：标记行占用 `base + recorded + 1`，随后把 `base` 重新锚定到该 seq、`recorded` 归为压缩后的上下文长度；**seq 允许出现空档**，但保持严格递增且不覆盖历史。

## Scope

1. 新增 `compaction.py`：`CompactionPolicy`（阈值、保留轮数、估算参数）与字符启发式估算、切分点计算、转录渲染。
2. `AgentRuntime` 在每次模型调用前检查上下文是否超阈值；超了就调注入的 provider（**空工具列表**的摘要调用）生成摘要，把被摘要的旧消息从后续请求里替换为带标记的 system 消息，只保留最近 N 轮。
3. 压缩结果持久化：压缩后的 `messages` 直接写进 checkpoint 的 `run_state`（resume 恢复的就是它），并在会话历史追加带标记的消息；会话 seq 在压缩处重新锚定。
4. 新增 `CompactionEvent`（type=`compaction`），JSONL 与 text 两种渲染都覆盖；CLI 增加 `--keep-recent-turns` 与 `--compact-above-tokens`。

## Non-goals

- 不改后端 schema（会话表没有 title/summary 字段也照旧）；不碰 `backend/` 与 `ui/`。
- 不做前端、不做 SSE 事件日志、不做队列 / worker。
- 不引入 tokenizer 依赖；估算保持字符启发式，假设写在代码与 README 里。
- 不改变 checkpoint 的续跑语义：`run_state` 仍是唯一续跑来源，会话历史仍只读。

## Acceptance Criteria

- [x] 上下文超阈值后，发给模型的下一次请求**不再包含**被摘要的原始消息，包含摘要本身（带标记），且保留最近 N 轮。
- [x] 摘要调用使用注入的 provider 且工具列表为空；摘要失败不杀死 run（保持原上下文继续）。
- [x] 压缩后的 `messages` 写进 checkpoint：`run_state.messages` 含摘要消息、`run_state.compaction.compactedMessages > 0`。
- [x] `--resume` 后第一个模型请求的上下文与压缩后一致（含摘要、不含被压缩原文），不退化成全量或空。
- [x] 会话历史里能查到压缩标记行，且其后的消息 seq 严格大于标记行、不与既有 seq 冲突。
- [x] `CompactionEvent` 出现在事件流里，CLI 两种输出格式都能渲染。
- [x] `cd agent-core && UV_INDEX_URL=https://pypi.org/simple uv run pytest -q` 不退化（原 93 条 → 现 97 passed）；`archkit inspect .` 通过。

## Implementation

- `compaction.py`（新增）：`CompactionPolicy`（`max_context_tokens` / `keep_recent_turns` / `min_messages` / `chars_per_token` / `threshold_ratio`，带边界校验）、`estimate_message_tokens` / `estimate_context_tokens`（字符启发式）、`should_compact`、`cut_index`（从末尾数第 N 条 assistant 作为保留起点，找不到安全切点时返回 `len(messages)` 让调用方跳过）、`render_transcript`、`compaction_marker`。
- `runtime.py`：新增 `CompactionEvent`（并入 `RunEvent`）与构造参数 `compaction: CompactionPolicy | None`（None → 默认策略）；`_summary_prompt` / `_summarise` 用注入 provider 且工具列表为空；`_maybe_compact` 完成判定 → 摘要 → `messages[:] =` 就地替换 → 会话标记 → 立即 `_save_checkpoint` → 产出事件；`_drive` 在每次 `budget.start_turn()` 之前钩一次；checkpoint 的 `extra` 增加 `compaction` 元数据块，`resume` 会把它读回来。
- `session.py`：新增 `record_compaction(marker_wire, context_length)`——标记行取 `base + recorded + 1`，随后 `base` 重锚到该 seq、`recorded` 归为压缩后长度；append 失败也照样推进游标，保证后续历史不会写进旧槽位。
- `cli.py`：新增 `--keep-recent-turns` 与 `--compact-above-tokens`（`_build_compaction`），`event_to_wire` / `event_to_text` 覆盖 `compaction` 事件。
- `__init__.py`：导出 `CompactionEvent` / `CompactionPolicy` / `estimate_context_tokens` / `should_compact`。
- `README.md`：新增「Context compaction」一节（估算假设、阈值、持久化与失败语义），Layout 补 `compaction.py`。
- 测试 `tests/test_compaction.py`（4 条）：压缩后请求内容与保留轮次、checkpoint 持久化 + 会话标记 + seq 单调、硬杀后 resume 恢复压缩上下文、摘要失败兜底 + 估算/切分边界。

## Verification

TDD 红灯（实现前）：

```
cd agent-core && UV_INDEX_URL=https://pypi.org/simple uv run pytest tests/test_compaction.py -q
→ ModuleNotFoundError: No module named 'resumate_agent_core.compaction'（1 error）
```

全量：

```
cd agent-core && UV_INDEX_URL=https://pypi.org/simple uv run pytest -q
→ 97 passed in 0.17s（原有 93 条未退化，新增 4 条）

archkit inspect .
→ Quality gates passed.
```

CLI 冒烟（MockTransport + 内存假服务端，脚本化 provider；阈值压到 600 便于触发）：

```
resumate-agent --resume-id res_1 --prompt "tighten bullets" --model gpt-4o-mini \
  --compact-above-tokens 600 --keep-recent-turns 1

{"type": "message", "text": "turn-1 xxx..."}
{"type": "tool_progress", ...}
{"type": "tool_progress", ...}
{"type": "message", "text": "turn-2 xxx..."}
{"type": "tool_progress", ...}
{"type": "tool_progress", ...}
{"type": "compaction", "compactedMessages": 3, "keptMessages": 2, "summaryChars": 88,
 "tokensBefore": 661, "tokensAfter": 413}
{"type": "message", "text": "turn-3 xxx..."}
{"type": "tool_progress", ...}
{"type": "tool_progress", ...}
{"type": "compaction", "compactedMessages": 3, "keptMessages": 2, "summaryChars": 88,
 "tokensBefore": 692, "tokensAfter": 413}
{"type": "message", "text": "Done"}
{"type": "finalize", ..., "sessionId": "ses_1", "state": "finalized" ...}
{"type": "session", "sessionId": "ses_1"}
exit code: 0

summariser calls: 2
last request roles: ['system', 'system', 'assistant', 'tool']
last request contains marker: True
last request keeps turn-3: True
last request still has turn-1: False
checkpoint compaction block: {'version': 1, 'marker': '[compacted-history]',
  'compactedMessages': 3, 'keptMessages': 2, 'keepRecentTurns': 1, 'summaryChars': 88}
```

注：`backend/` 与 `ui/` 本次未改动，因此没有跑后端/前端测试（另有子代理正在 `-wt-openturn` 改这两处）。

## Related ADRs

- None.
