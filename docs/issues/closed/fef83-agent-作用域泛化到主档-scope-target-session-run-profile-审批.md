---
id: fef83
status: closed
created_at: 2026-10-01T08:00:00.000Z
updated_at: 2026-10-02T02:35:17.420Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-02T02:30:52.354Z
closed_at: 2026-10-02T02:35:17.420Z
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

- [x] 迁移对已有行安全；upgrade/downgrade 在 SQLite 与既有 `test_migrations` 下通过。
- [x] `POST /sessions/{id}/runs` 权限与归属正确（PAT/run 凭据 403，外来会话 404）。
- [x] `scope=profile` 建轮次（无 resumeId）；`scope=resume` 缺 resumeId 明确失败。
- [x] profile pending action approve 真写入主档、reject 不写；run 凭据调用 approve 仍 403。
- [x] 既有简历流程测试全部通过：`uv run --directory backend pytest -q`（现有 209 不退化）；`archkit inspect .` 通过。

## Implementation

- 迁移 `e3a1c7d9b2f4_add_agent_scope_and_profile_target.py`：`batch_alter_table` 把 `agent_turns.resume_id` / `agent_pending_actions.resume_id` 改可空，并加 `scope` / `target`（非空、server_default `resume`），SQLite 与 Postgres 都可用；`models.py` 同步。
- 建轮次：`TurnCreateRequest` 增 `scope`/`resumeId`；`UserTurnResponse` 增 `scope`、`resumeId` 可空；新增 `service.begin_scoped_turn` / `_begin_profile_turn`，profile 轮次按 session 取代旧 open 轮次；新增 `POST /turns`；`POST /resumes/{id}/turns` 固定 scope=resume。简历专属操作对 profile 轮次统一 422。
- profile run：`run_token.RunCredential.resume_id` 与 `issue_run_token` 改可空；`runner.start_run` 抽成 `_spawn` 核心并新增 `start_session_run`；`_child_command` 无 resume 时不传 `--resume-id`；新增 `POST /sessions/{session_id}/runs`（`resume:write` + 人类会话）。
- profile 待确认改动：`agent/schemas.py` 定义 `ProfileAction`（create_fact / update_fact / update_basics，discriminated union）与 preview request/response；`PendingActionResponse` 增 `target`、`targetResource` 可空、`kind` 扩为 `content_patch|profile_change`。`service.stage_profile_action`（approval 建 pending / full_access 立即写并留 approved 记录）与 `_apply_profile_ops`（复用 `profile/service.py` 的 `create_fact` / `update_fact` / `update_basics`）落地；`decide_action` 在 `target=profile` 且 approve 时写主档，reject 不写。
- 契约 §6 新增两个端点行；新增 §21（scope 语义、通用建轮次、profile run、profile 审批语义）；README 端点 84 -> 86、后端 209 -> 221；`.freak` 记录第 1 阶段边界。
- 测试：`tests/test_profile_scope.py`（12 条）覆盖 profile 建轮次、scope=resume 缺 resumeId、既有端点仍 resume、profile 轮次拒绝简历 patch、session run 的 argv/env/未知会话 404/PAT 403/run 凭据 403、profile approve 真写入、reject 不写、run 凭据 approve 403。

## Verification

红：实现前 `tests/test_profile_scope.py` 分步失败（迁移列缺失、`POST /turns` 与 `POST /sessions/{id}/runs` 不存在、`stage_profile_action` 不存在）。

```console
$ cd backend && uv run pytest -q
221 passed, 4 warnings in 9.62s

$ DATABASE_URL=sqlite:// uv run --directory backend alembic upgrade head   # exit 0

# 文件型 SQLite 双向：
$ DATABASE_URL=sqlite:////tmp/pscope-migration.sqlite3 uv run alembic upgrade head
$ ... alembic current  ->  e3a1c7d9b2f4 (head)
$ ... alembic downgrade -1  # exit 0
$ ... alembic current  ->  a4d8e2f6c1b9
$ ... alembic upgrade head  # exit 0（可再次前进）

$ archkit inspect .
Quality gates passed.
```

基线 209 条，无退化（+12）。

## Related ADRs

- None.
