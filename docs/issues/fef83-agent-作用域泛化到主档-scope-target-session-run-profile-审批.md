---
id: fef83
status: in-progress
created_at: 2026-10-01T08:00:00.000Z
updated_at: 2026-10-02T02:30:52.354Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-02T02:30:52.354Z
---

# Agent 作用域泛化到主档：scope/target + session run + profile 审批

## Background

- 当前 Agent 是简历中心的：`agent_turns.resume_id` 与 `agent_pending_actions.resume_id` 均 NOT NULL，agent-core 工具全是简历工具。
- 主档（profile）在 UI 上是普通抽屉，走本地启发式；要接真实 Agent，服务端必须先支持 profile 作用域。

## Scope

- 迁移：`agent_turns.resume_id` 可空 + `scope`（resume|profile，非空，默认 resume）；`agent_pending_actions.resume_id` 可空 + `target`（resume|profile，非空，默认 resume）。
- 新端点 `POST /sessions/{session_id}/runs`：`resume:write` + 人类会话；body `{prompt}`；复用 spawn；scope=profile 不需简历；会话须属调用者（否则 404）；202 与既有同构。
- 建轮次：新增通用 `POST /turns`，body 带 `scope`；profile 可不传 `resumeId`（需 `sessionId`）；resume 时 `resumeId` 必填；既有 `POST /resumes/{id}/turns` 保持不变（强制 resume）。
- profile 待确认改动：PendingAction `target=profile`，ops 为 `{op: create_fact|update_fact|update_basics, payload}`；approve 真正写入主档（复用 `profile/service.py`），reject 不写；approve/reject 仍人类会话。
- 契约新增章节，写明 scope 语义与 profile 审批语义。

## Non-goals

- 不改 agent-core、不改前端；不新增 profile 工具。
- 不合并回 main。

## Acceptance Criteria

- [ ] 迁移对已有行安全；upgrade/downgrade 在 SQLite 与既有 `test_migrations` 下通过。
- [ ] `POST /sessions/{id}/runs` 权限与归属正确（PAT/run 凭据 403，外来会话 404）。
- [ ] `scope=profile` 建轮次（无 resumeId）；`scope=resume` 缺 resumeId 明确失败。
- [ ] profile pending action approve 真写入主档、reject 不写；run 凭据调用 approve 仍 403。
- [ ] 既有简历流程测试全部通过：`uv run --directory backend pytest -q`（现有 209 不退化）；`archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
