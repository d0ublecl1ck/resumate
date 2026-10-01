---
id: 9d29a
status: in-progress
created_at: 2026-10-01T01:00:00.000Z
updated_at: 2026-10-01T01:04:39.465Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:04:39.465Z
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

- [ ] 三张表/列按上述结构落地，迁移在 SQLite 与 PostgreSQL 上可用，对已有行安全。
- [ ] 会话与消息端点按 owner 隔离，未知/越权资源返回 404；`GET /sessions` 最近活跃优先。
- [ ] `POST /sessions/{id}/messages` 对同一 (session_id, seq) 幂等，不产生重复。
- [ ] `PUT /turns/{turn_id}/state` 用 stateVersion 乐观锁，版本不匹配返回 409 `RUN_STATE_CONFLICT`。
- [ ] `POST /resumes/{resume_id}/turns` 接受 `sessionId`，未知会话 404，挂载后会话活跃时间被刷新。
- [ ] agent-core 通过公共 API 落 checkpoint；`AgentRuntime` 每轮模型调用后写一次；`--resume` 能从存储恢复并继续到 finalize。
- [ ] `uv run --directory backend pytest -q` 现有 176 条不退化；`cd agent-core && uv run pytest -q` 现有 78 条不退化；CLI 冒烟证明状态从存储恢复；`archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
