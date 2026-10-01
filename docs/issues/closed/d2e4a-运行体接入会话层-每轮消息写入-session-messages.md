---
id: d2e4a
status: closed
created_at: 2026-10-01T01:12:31.067Z
updated_at: 2026-10-01T01:16:52.496Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 数据模型
started_at: 2026-10-01T01:12:56.059Z
closed_at: 2026-10-01T01:16:52.496Z
---

# 运行体接入会话层：每轮消息写入 session messages

## Background

会话层（`agent_sessions` / `agent_session_messages`、`POST /sessions`、`GET|POST /sessions/{id}/messages`、`GET|PUT /turns/{id}/state`）与 agent-core 客户端方法都已落地（issue 9d29a），但运行体从不创建 session、也从不往 session messages 追加任何东西：对话历史存不下来，「历史会话」类界面与压缩/摘要都缺数据源。

本 Issue 让 `AgentRuntime` 真正用起会话层，同时**不改变 checkpoint 语义**：`run_state` 继续承担断点续跑，session messages 只负责「历史可查询」。

## Scope

1. `AgentRuntime` 在 run 开始时确保会话存在（复用调用方传入的 `sessionId`，未传则创建），并把每一条进入上下文的模型消息（system / user / assistant / tool）写入 `agent_session_messages`。
2. `seq` 单调递增且连续：`seq = 消息在上下文列表中的下标 + 1`，因此同一份上下文在重放/续跑时算出同一批 seq，服务端按 `(session_id, seq)` 幂等吸收，客户端不自己造重复。
3. 创建 turn 时带 `sessionId`（后端已支持），让轮次与会话关联。
4. CLI 新增 `--session <sessionId>`；未传时自动创建，并在事件流结束时把 `sessionId` 输出到 stdout。
5. `run_state` 的 checkpoint 额外记录 `sessionSeq`（已镜像到会话的消息条数）与 `sessionId`，续跑时据此跳过已镜像前缀。

## Non-goals

- 不做压缩 / 摘要、不做前端、不做 SSE 事件日志 / outbox、不做队列 / worker。
- 不拿 session messages 替代 checkpoint：续跑仍只读 `run_state`。
- 不实现「跨 turn 续写同一会话」的上下文继承（本 Issue 里一个 turn 的上下文只来自它自己的 checkpoint）。
- agent-core 仍然不碰数据库（C-09）。

## Acceptance Criteria

- [x] 一轮 run 后，服务端 session messages 的 `seq` 连续（1..N）且 `role` 序列为 system / user / assistant / tool / assistant。
- [x] turn 创建请求里带 `sessionId`，且该 session 就是消息写入的 session。
- [x] 用同一批消息重复 record 时，服务端 seq 不重复、总数不增长（服务端幂等吸收）。
- [x] 崩溃后用新进程 / 新 runtime 从 checkpoint 续跑，session messages 不出现重复 seq，最终 seq 仍连续。
- [x] CLI 未传 `--session` 时自动建会话并在结束时把 `sessionId` 打到 stdout；传了则复用同一个会话。
- [x] `cd agent-core && uv run pytest -q`（93 passed）与 `uv run --directory backend pytest -q`（182 passed）不退化；`archkit inspect .` 通过。

## Implementation

- `agent-core/src/resumate_agent_core/session.py`（新增）：`SessionJournal`。`start(sessionId=None, base=None, recorded=0)` 复用给定会话或新建；`record(messages)` 只追加尚未镜像的部分，`seq = base + 上下文下标 + 1`，追加是 best-effort（失败保留游标，下次重试，服务端幂等吸收）。
- `base` 语义：新会话为 0；复用已有会话时取该会话当前最大 seq，因此第二次 run 追加在历史之后而不是覆盖旧槽位。`base` 随 checkpoint 的 `sessionBase` 持久化，续跑直接用它，重放仍是确定性的。
- `runtime.py`：`AgentRuntime` 新增 `sessions` 与只读属性 `session_id`；`run()` 先 `_open_session(...)` 再建 turn（`TurnSession(session_id=...)`），开头就镜像 system+user；`_save_checkpoint` 先 `_record_session(messages)` 再写 checkpoint，并在 `extra` 里带 `sessionId` / `sessionBase` / `sessionSeq`；`resume()` 用 turn 上的 `session_id` 与 checkpoint 里的 base/seq 继续写。
- `turn.py`：`TurnSession` 接受 `session_id` 并透传给 `create_turn`。
- `cli.py`：新增 `--session`（env `RESUME_AGENT_CORE_SESSION`）；`AgentRuntime(..., sessions=SessionJournal(client))`；事件流结束后输出 `{"type": "session", "sessionId": ...}`（text 模式为 `[session] ...`），`--state` 快照也写入 `sessionId`。
- `README.md`：新增「Session history」一节，环境变量表补 `RESUME_AGENT_CORE_SESSION`，Layout 补 `session.py`。
- 测试：`tests/test_session_journal.py`（6 条：seq 连续、重放幂等、复用会话续写、turn 关联会话、崩溃后续跑不重复、会话只创建一次）+ `tests/test_cli.py` 增 2 条并更新既有的 handler 与期望。

## Verification

TDD 红灯（实现前）：

```
cd agent-core && UV_INDEX_URL=https://pypi.org/simple uv run pytest tests/test_session_journal.py -q
→ ModuleNotFoundError: No module named 'resumate_agent_core.session'（1 error）
```

三条验证命令：

```
UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q
→ 182 passed, 4 warnings in 6.51s

cd agent-core && UV_INDEX_URL=https://pypi.org/simple uv run pytest -q
→ 93 passed in 0.11s（新增 8 条；原有 85 条未退化）

archkit inspect .
→ Quality gates passed.
```

CLI 冒烟：一次「跑到一半被硬杀 → 新进程 --resume → finalize」。用 MockTransport + 内存假服务端（实现 `/sessions`、`/sessions/{id}/messages`、`/turns/{id}/state`、`/resumes/{id}/turns` 等端点，服务端按 `(session_id, seq)` 幂等），不碰真实网络：

```
== run 1: killed mid-run ==
(KeyboardInterrupt: no finalize, no session line)  events so far: 3
turn sessionId: ses_1
stored (seq, role): [(1, 'system'), (2, 'user'), (3, 'assistant'), (4, 'tool')]

== run 2: fresh process, --resume turn_1 ==
{"type": "message", "text": "Done"}
{"type": "finalize", "turn": {..., "sessionId": "ses_1", "state": "finalized", ...}, "result": {...}}
{"type": "session", "sessionId": "ses_1"}
exit code: 0
stored (seq, role): [(1, 'system'), (2, 'user'), (3, 'assistant'), (4, 'tool'), (5, 'assistant')]
rows: 5 distinct seq: 5
append calls: [('ses_1', 1), ('ses_1', 2), ('ses_1', 3), ('ses_1', 4), ('ses_1', 5)]
```

第二个进程是全新的 `AgentRuntime` + 全新 `ResumateClient`，上下文只可能来自服务端存储；`seq` 连续且无重复，证明续跑没有重写历史。

## Related ADRs

- None.
