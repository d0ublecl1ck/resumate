---
id: 89ffd
status: closed
created_at: 2026-09-30T15:38:31.737Z
updated_at: 2026-09-30T15:41:07.066Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-30T15:38:46.214Z
closed_at: 2026-09-30T15:41:07.066Z
---

# 为 agent-core 增加可执行 CLI 入口

## Background

agent-core 已经具备完整的库能力：`ResumateClient`（公共 REST）、`TurnSession`（轮次生命周期）、`AgentRuntime.run()`（C-09 循环体）、`OpenAICompatibleProvider`（模型适配）。但整包**没有任何可执行入口**：运行体只能被 import，无法作为一个独立进程跑起来，所以「运行体」这条路线目前只存在于代码里。

按已锁定决策 1，运行体先是**独立进程**，第一步做 CLI（不可逆性最低），后端将来 spawn 同一个入口。本 Issue 把这一步落地：新增 `resumate-agent` 控制台脚本与 `python -m resumate_agent_core`，**复用**现有 `AgentRuntime.run()` 与 `TurnSession`，不另写一套循环。

同时顺手修掉 `agent-core/README.md` 里两处与现状不符的文档：PAT 已经实现，但 README 仍写「session cookie now, PAT later」与「bearer token (future PAT)」。

## Scope

**代码**

- 新增 `src/resumate_agent_core/cli.py`：argparse 参数解析、按 pi `--mode json` 形态输出事件（stdout 一行一个 JSON 事件）、`--events text` 的人类可读输出、极简 `--state` 快照写入。
- 新增 `src/resumate_agent_core/__main__.py`：让 `python -m resumate_agent_core` 走同一个入口。
- `pyproject.toml`：新增 `[project.scripts]`，命令名 `resumate-agent`。
- 参数（能力齐备，命名见 `--help`）：`--resume-id`、`--prompt`、`--execution-mode`、`--base-url`、`--session-cookie`、`--token`、`--model`、`--api-key`、`--provider-base-url`、`--state`、`--events`，以及 `--base-version-id`、`--turn-id`、`--turn-message`、`--client-id`、`--max-turns`、`--max-tokens`、`--max-cost-usd`、`--temperature`、`--provider-max-tokens`。
- 环境变量：连接与凭据沿用 `AgentCoreSettings` 既有约定（`RESUME_AGENT_CORE_BASE_URL` / `SESSION_COOKIE` / `TOKEN` / `CLIENT_ID` / `TIMEOUT_SECONDS` / `VERIFY_SSL`）；模型与运行参数用同一前缀新增 `MODEL` / `API_KEY` / `PROVIDER_BASE_URL` / `EXECUTION_MODE` / `STATE` / `EVENTS`。CLI 参数优先于环境变量。
- `--state <path>` 本期只做最小语义：run 开始时先写一份 `phase=started` 快照，结束时用同一路径覆盖为 `phase=finished|failed` 快照（含 `startedAt` / `endedAt`）。它是**最新快照，不是 checkpoint 历史**。

**文档**

- `agent-core/README.md`：修 PAT 过期表述；补 CLI 用法、环境变量表与 `--state` 的边界说明；写清「为什么本期只做 start/end 快照」（真正的每轮 checkpoint 是下一个 Issue）。

## Non-goals

- 不实现真正的 checkpoint / `--resume` 断点续跑——按决策 2，checkpoint 是**每轮模型调用后**落盘，属于下一个 Issue；本期只把 `--state` 这个 hook 留出来并写清边界。
- 不实现 SSE / 流式模型输出，也不改模型侧调用方式。
- 不实现长驻服务，也不在后端 spawn 这个入口（决策 1 的后续）。
- 不改 `backend/` 与 `ui/`，不引入新依赖（`httpx` + `pydantic` 已足够）。
- 不把运行状态藏进进程内存充当「已持久化」：无状态是这条路线的前提。
- 不改审批在场证明（决策 5，维持现状）。

## Acceptance Criteria

- [x] `resumate-agent --help` 与 `python -m resumate_agent_core --help` 都能列出全部参数。
- [x] `--events json` 时 stdout 每行都是合法 JSON，事件序列覆盖 message / tool_progress / finalize。
- [x] 用 `httpx.MockTransport` 走通最短路径：建轮次 → 工具调用 → finalize，不依赖真实网络与真实模型。
- [x] `--state <path>` 在 run 开始先落 `phase=started` 快照（首次模型调用前即可读到），结束时覆盖为 `phase=finished`。
- [x] 失败路径（建轮次 403）产出 error 事件并以非 0 退出码结束，状态文件落 `phase=failed`。
- [x] 凭据（api key、session cookie）不出现在 stdout/stderr。
- [x] `agent-core/README.md` 不再出现「session cookie now, PAT later」与「bearer token (future PAT)」，且记录 CLI 用法与 `--state` 边界。
- [x] `cd agent-core && uv run pytest -q` 全绿；`archkit inspect .` 通过。

## Implementation

- `cli.py`（新增）：`build_parser`（全部参数 + 同前缀环境变量默认值）、`event_to_wire` / `event_to_text`（JSONL 与人类可读两种渲染；wire 用 camelCase，沿用 `ApiModel.to_wire()`）、`write_state` / `state_payload`（最小快照）、`main`。
- 复用而非重写：`main` 只组装 `AgentCoreSettings` + `ResumateClient` + `OpenAICompatibleProvider` + `RunBudget`，循环体完全交给 `AgentRuntime.run()`；`TurnSession` 由 runtime 内部构造，没有第二套轮次逻辑。
- 注入缝（只在测试使用，真实调用不传）：`transport`、`provider`、`provider_factory`、`stdout`、`stderr`、`now`。`now` 让状态快照的断言是确定性的。
- 退出码：`0` 见到 finalize 且无 error；`1` 出现 error 事件或始终没有 finalize；`2` 需要自建 provider 但缺 `--model`。
- 凭据安全：api key 与 session cookie 只进入 httpx 请求头，不打印；`client.close()` / `provider.close()` 在 finally 中释放。
- `__main__.py`（新增）：`python -m resumate_agent_core` → `cli.main`。
- `pyproject.toml`：`[project.scripts] resumate-agent = "resumate_agent_core.cli:main"`。
- `agent-core/README.md`：修正 PAT 表述，新增「CLI runner」章节（用法、事件形态、退出码、`--state` 边界与「为什么先只做快照」），环境变量表补 6 个新变量，Layout 补 `cli.py` / `__main__.py`。
- 根 `README.md` 与 `.freak`：agent-core 测试口径复核为 78 passed（前端/后端数字留给各自改动方，本分支不冒认）。

## Verification

TDD 红灯（实现前）：

```
cd agent-core && uv run pytest tests/test_cli.py -q
→ ImportError: cannot import name 'cli' from 'resumate_agent_core'
→ ERROR tests/test_cli.py ... 1 error in 0.08s
```

绿灯与本包全量：

```
cd agent-core && uv run pytest tests/test_cli.py -q
→ 8 passed in 0.06s

cd agent-core && uv run pytest -q
→ 78 passed in 0.07s
```

CLI 冒烟（在 `agent-core` 目录用 MockTransport + 脚本化 provider 调 `cli.main`，不碰网络与真实模型）：

```
{"type": "message", "text": "Inspecting the working copy"}
{"type": "tool_progress", "toolCallId": "c1", "name": "get_working_document", "phase": "started", "result": null, "detail": null}
{"type": "tool_progress", "toolCallId": "c1", "name": "get_working_document", "phase": "completed", "result": {"resumeId": "res_1", ...}, "detail": null}
{"type": "message", "text": "Experience bullets tightened."}
{"type": "finalize", "turn": {"id": "turn_1", ..., "state": "finalized", ...}, "result": {"versionId": "ver_1", ...}}
exit code: 0

--- state 文件 ---
{
  "version": 1,
  "phase": "finished",
  "resumeId": "res_1",
  "executionMode": "approval",
  "startedAt": "2026-09-30T15:40:35.941651+00:00",
  "endedAt": "2026-09-30T15:40:35.946101+00:00",
  "lastEventType": "finalize"
}
```

两个入口：

```
cd agent-core && uv run resumate-agent --help        # 列出全部参数（见交付报告）
cd agent-core && uv run python -m resumate_agent_core --help   # 同一入口
```

门禁：

```
archkit inspect .
→ Quality gates passed.
```

留给下一个 Issue 的能力（有意未做）：

- 每轮模型调用后的 checkpoint 与 `--resume` 断点续跑；本期 `--state` 只是最新快照，重启无法恢复。
- 持久化的 session / message 存储（决策 3）与模型密钥按 run 临时下发（决策 4）。
- 后端 spawn 同一入口、SSE 推送、长驻服务。

## Related ADRs

- None.
