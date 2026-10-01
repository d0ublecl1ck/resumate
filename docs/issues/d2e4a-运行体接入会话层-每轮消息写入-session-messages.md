---
id: d2e4a
status: in-progress
created_at: 2026-10-01T01:12:31.067Z
updated_at: 2026-10-01T01:12:56.059Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 数据模型
started_at: 2026-10-01T01:12:56.059Z
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

- [ ] 一轮 run 后，服务端 session messages 的 `seq` 连续（1..N）且 `role` 序列为 system / user / assistant / tool / assistant...。
- [ ] turn 创建请求里带 `sessionId`，且该 session 就是消息写入的 session。
- [ ] 用同一个 runtime 重复 `record` 同一批消息时，服务端 seq 不重复、总数不增长（服务端幂等吸收）。
- [ ] 崩溃后用**新进程 / 新 runtime** 从 checkpoint 续跑，session messages 不出现重复 seq，且最终 seq 仍连续。
- [ ] CLI 未传 `--session` 时自动建会话并在结束时把 `sessionId` 打到 stdout；传了则复用同一个会话。
- [ ] `cd agent-core && uv run pytest -q` 与 `uv run --directory backend pytest -q` 不退化；`archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
