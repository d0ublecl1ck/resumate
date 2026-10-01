---
id: 9d29a
status: closed
created_at: 2026-10-01T01:00:00.000Z
updated_at: 2026-10-01T01:10:19.085Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:04:39.465Z
closed_at: 2026-10-01T01:10:19.085Z
---

# 落地会话层与 run checkpoint

## Background

- 外部 Agent 中断后无法从中断处继续：agent-core 的 `--state` 只写开始/结束两条本地快照，不是 checkpoint（`.freak` 2026-09-30 已登记）。
- 后端没有会话/消息持久化，也没有轮次级 run 状态的读写端点。
- 约束：agent-core 不得直接碰数据库（C-09），run/session 状态必须走公共 API。

## Scope

- 新表 `agent_sessions`（owner_id 索引）、`agent_session_messages`（(session_id, seq) 唯一）；`agent_turns` 增 `session_id`（可空索引）、`run_state`（JSON 默认 {}）、`state_version`（int 默认 0）。迁移对已有行安全。
- 端点：`POST /sessions`、`GET /sessions`（owner 隔离，最近活跃优先）、`GET /sessions/{id}/messages?afterSeq=`、`POST /sessions/{id}/messages`（(session_id, seq) 幂等）、`GET|PUT /turns/{turn_id}/state`（PUT 用 stateVersion 乐观锁，不匹配 409 `RUN_STATE_CONFLICT`）、`POST /resumes/{resume_id}/turns` 增可选 `sessionId`。
- agent-core：新增走上述端点的 checkpoint 客户端；`AgentRuntime` 每轮模型调用后落 checkpoint（messages + budget + turn_id + pending_action_id + phase）；CLI 增 `--resume <turnId>`；同步修 README 与 `.freak` 的「--state 不是 checkpoint」说明。
- 契约 `docs/agent/agent-operation-api.md` 新章节；README 端点计数实测后同步。

## Non-goals

- 不做压缩/摘要、前端接线、SSE 事件日志/outbox、队列/worker。
- 不改模型密钥的后端加密存储。
- 不合并回 main，不动主工作区。

## Acceptance Criteria

- [x] 三张表/列按上述结构落地，迁移在 SQLite 与 PostgreSQL 上可用，对已有行安全。
- [x] 会话与消息端点按 owner 隔离，未知/越权资源返回 404；`GET /sessions` 最近活跃优先。
- [x] `POST /sessions/{id}/messages` 对同一 (session_id, seq) 幂等，不产生重复。
- [x] `PUT /turns/{turn_id}/state` 用 stateVersion 乐观锁，版本不匹配返回 409 `RUN_STATE_CONFLICT`。
- [x] `POST /resumes/{resume_id}/turns` 接受 `sessionId`，未知会话 404，挂载后会话活跃时间被刷新。
- [x] agent-core 通过公共 API 落 checkpoint；`AgentRuntime` 每轮模型调用后写一次；`--resume` 能从存储恢复并继续到 finalize。
- [x] `uv run --directory backend pytest -q` 现有 176 条不退化；`cd agent-core && uv run pytest -q` 现有 78 条不退化；CLI 冒烟证明状态从存储恢复；`archkit inspect .` 通过。

## Implementation

后端（commit 0e4b3bd）：

- `app/modules/agent/models.py`：新增 `AgentSession`（owner_id 索引，无 resume_id）、`AgentSessionMessage`（(session_id, seq) 唯一，content JSON）；`AgentTurn` 增 `session_id`（可空索引）、`run_state`（JSON 默认 dict）、`state_version`（int 默认 0）。
- 迁移 `a4d8e2f6c1b9`（down_revision `c4a7e2b9f1d3`）：新增列可空或带 server_default（`run_state` 默认 `{}`、`state_version` 默认 0），对已有行安全；SQLite 全链升级由 `test_migrations.py` 校验，并把两张新表与新列加入守卫。
- `app/shared/errors.py`：新增 `RUN_STATE_CONFLICT` 与 `RunStateConflict`（409）。
- `schemas.py` / `dao.py` / `service.py` / `api.py`：会话与 checkpoint 的完整分层实现；`POST /resumes/{resume_id}/turns` 接受可选 `sessionId`，未知会话 404，挂载后 `_touch_session` 刷新 `updated_at`/`last_active_at`，`UserTurnResponse` 回显 `sessionId`。
- 权限码（理由见报告）：`POST /sessions`、`POST /sessions/{id}/messages`、`PUT /turns/{turn_id}/state` 用 `resume:write`；`GET /sessions`、`GET /sessions/{id}/messages`、`GET /turns/{turn_id}/state` 用 `resume:read`。沿用 Agent 操作层既有的两个 scopable 码，PAT 可用，且不新增权限目录条目。
- 幂等与乐观锁：`(session_id, seq)` 重复 POST 返回既有行；PUT state 要求 `stateVersion` 等于当前值，否则 409 且不写入，成功后 +1。

agent-core（commit 50fd842）：

- `models.py` / `client.py`：`AgentSession` / `AgentMessage` / `TurnState` 与对应端点方法；`create_turn` 增 `session_id`；`UserTurn.session_id`。
- `checkpoint.py`：`CheckpointStore`（GET-then-PUT，冲突时重读重试一次）、`build_run_state`、`messages_from_run_state`；所有 I/O 走公共 API（C-09）。
- `runtime.py`：`Message.from_wire`、`RunBudget.from_snapshot`；循环抽出 `_drive`，每轮模型调用后 checkpoint，终态写 finalized/cancelled/failed；新增 `resume(turn_id)` 从服务端 checkpoint 恢复消息与 budget 后继续。
- `cli.py`：新增 `--resume <turnId>`；`--resume-id`/`--prompt` 仅在非 resume 时必填；`--state` 明确为本地观测快照。README 与 `.freak` 同步。

文档（commit a974173）：契约 §19（资源模型 / 端点 / 消息幂等 / checkpoint 乐观锁 / `RUN_STATE_CONFLICT`）；README 端点 75→81、后端 176→182、agent-core 78→85；design.md 与 Skill（18 端点 + §4.13）。

## Verification

红（实现前）：后端 `tests/test_agent_sessions.py` 因 `ImportError: cannot import name AgentSession` 整文件报错；agent-core `tests/test_session_checkpoint.py` 因 `ModuleNotFoundError: No module named resumate_agent_core.checkpoint` 整文件报错。

绿：

```console
$ uv run --directory backend pytest -q
182 passed, 4 warnings in 5.99s

$ cd agent-core && uv run pytest -q
85 passed in 0.10s

$ archkit inspect .
Quality gates passed.
```

CLI 冒烟（隔离库 resumate_checkpoint_check + uvicorn :8012；进程 A 在第一次 checkpoint 后 `KeyboardInterrupt` 崩溃，进程 B 独立 `--resume`）：

```text
RUN 1 start_exit=130（崩溃）
  tool_progress get_turn completed: turn_64de5f360b1c
  CRASHED=1
  服务端 checkpoint：stateVersion=1 phase=running messages=4 budget.tokensUsed=2
RUN 2 resume_exit=0
  restored_roles=[system, user, assistant, tool]
  restored_last_content={"id": "turn_64de5f360b1c", ...}   # 来自进程 A 的工具结果
  event_types=[message, finalize]  finalize_state=finalized
  最终 GET /turns/turn_64de5f360b1c → state=finalized
```

进程 B 是独立操作系统进程，只可能从服务端 checkpoint 恢复，因此证明状态确实来自存储而非内存。

## Related ADRs

- None.
