---
id: 60a52
status: in-progress
created_at: 2026-10-01T09:00:00.000Z
updated_at: 2026-10-02T02:36:46.345Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-02T02:36:46.345Z
---

# Agent 主档能力：profile 工具与端点、scope 注入（第 2 阶段）

## Background

- 第 1 阶段（fef83）已把 scope/target 泛化到主档，并能 `POST /sessions/{id}/runs` 起 profile run。
- 缺口：profile pending action 没有 HTTP 端点；agent-core 不认识主档；profile run spawn 出的 CLI 无 `--resume-id` 会失败。

## Scope

- 后端：`GET /sessions/{id}/turns`（owner 隔离、最新优先、含 pendingActions）；`POST /turns/{id}/profile-actions`（scope=profile 校验、允许 run 凭据、加入白名单、越权 404/403 审计）；profile 轮次的 finalize/cancel 泛化；session run 传 profile 作用域参数。
- agent-core：`get_profile`、`propose_profile_change` 工具；按 scope 注入工具集（profile 不注入简历读写工具）；CLI `--scope profile`；run 结束时写面向用户的 assistant 会话消息。
- 真实端到端跑一次 profile run，留下 `scope=profile` / `target=profile` 的 DB 证据。

## Non-goals

- 不重开 e9ad6 越权路径：approve/reject 仍人类会话，run 凭据 403。
- 不改前端；不合并回 main。

## Acceptance Criteria

- [ ] `GET /sessions/{id}/turns` 契约与 `GET /resumes/{id}/turns` 同构。
- [ ] `POST /turns/{id}/profile-actions` 允许 run 凭据、scope=profile 才可用、越权 404/403 且审计。
- [ ] `run_token._ALLOWED_ENDPOINTS` 覆盖新端点，`test_run_token_allowlist.py` 通过。
- [ ] agent-core profile 工具集不含简历读写工具；CLI profile 模式可跑；结束写 assistant 会话消息。
- [ ] `uv run --directory backend pytest -q` 现有 221 不退化；`cd agent-core && uv run pytest -q` 现有 97 不退化。
- [ ] 真实 profile run 端到端 + DB 证据；`archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
