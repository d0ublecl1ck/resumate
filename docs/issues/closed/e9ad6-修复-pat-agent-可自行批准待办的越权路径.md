---
id: e9ad6
status: closed
created_at: 2026-09-30T15:08:03.852Z
updated_at: 2026-09-30T15:10:35.287Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-30T15:08:14.183Z
closed_at: 2026-09-30T15:10:35.287Z
---

# 修复 PAT/Agent 可自行批准待办的越权路径

## Background

- 后端 `POST /pending-actions/{action_id}/approve|reject` 只声明 `resume:write`，`service.decide_action` 只校验待办归属、轮次开放、待办为 `pending`，没有任何 `auth_kind` / PAT 来源判定。持有 `resume:write` scope 的 PAT 可以自己批准自己的待办，再 `patches:apply` 落库，审批闭环被绕过。
- `agent-core` 的 `TOOLS` 把 `approve_action` / `reject_action` 暴露成模型可调用工具，等于把「人类动作」变成模型的自我批准入口。
- 契约 `docs/agent/agent-operation-api.md` §9 的「PAT Bearer 鉴权与 Scope 强制不在本期」已过期（PAT 已实现，见 §13 与 `docs/design.md:169`）；README 信任边界「批准与拒绝是用户动作，Agent 自行调用即越权」此前只是承诺，代码没有强制。

## Scope

- backend：在 `app/modules/auth/deps.py` 新增与 `require_permission` 并列的 `require_human_session` 依赖：`user.auth_kind == "pat"` 时抛 403 `FORBIDDEN`，并按既有 PAT 审计约定写一条 `denied`（新增语义清晰的 purpose 常量）；approve/reject 两个端点改用它。
- agent-core：从 `tools.py` 的 `TOOLS` 删除 `approve_action` / `reject_action` 及其 handler；同步 `tests/test_tools.py`、`skills/resumate-api-operations/SKILL.md`。
- docs：更新 `docs/agent/agent-operation-api.md` (§1/§2/§6/§9/§13) 与 README 信任边界，写明审批是人类动作、PAT/agent 来源一律 403。

## Non-goals

- 不改 `execution_mode` 的服务端解析逻辑，不把 `full_access` 改成需要审批。
- 不改审批状态机与 `decide_action` 的现有归属/轮次/状态校验。
- 不重构无关端点；不修 `ResumateClient.approve_action` / `TurnSession.approve` / `TurnSession.execute_patch` 等服务端已被拦截的客户端便利方法，仅在报告中列出。
- 不新增前端机器错误码与 i18n 词条（复用 `FORBIDDEN`）。

## Acceptance Criteria

- [x] PAT 调 `approve` 与 `reject` 返回 403 `FORBIDDEN`；待办保持 `pending`、未被置为 `approved`/`rejected`；写一条 `purpose=pat_human_session`、`result=denied`、`errorCode=FORBIDDEN` 的审计，且没有任何该 purpose 的 `allowed`。
- [x] cookie 会话的用户审批仍然成功（`200`，`state=approved`），未被误伤。
- [x] `agent-core` 的 `TOOLS` 不再包含 `approve_action` / `reject_action`；schema、handler、测试与 SKILL.md 工具表同步，无死代码。
- [x] 契约 §9 与 README 信任边界与实现一致，过期「PAT 不在本期」表述修正。
- [x] `uv run --directory backend pytest -q`、`cd agent-core && uv run pytest -q`、`pnpm -C ui test`、`archkit inspect .` 全部通过。

## Implementation

- `backend/app/modules/auth/deps.py`：新增 `PAT_HUMAN_SESSION_PURPOSE = "pat_human_session"` 与 `require_human_session` 依赖。PAT 来源先经 `_record_pat_log` 写一条 `denied`（`error_code=FORBIDDEN`），再抛 `Forbidden("审批动作仅限人类会话，Agent 令牌不可调用")`；错误码复用现成 `FORBIDDEN`，未新增前端机器错误码与 i18n 词条。
- `backend/app/modules/agent/api.py`：approve / reject 端点在 `require_permission("resume:write")` 之外叠加 `Depends(require_human_session)`。`require_permission` 排在前面，scope 语义与端点权限守卫（`__required_permission__` 恰好一个）保持不变。
- `agent-core/src/resumate_agent_core/tools.py`：删除 `_approve_action` / `_reject_action` handler 与 `TOOLS` 中两个条目，注册表从 12 个工具缩到 10 个；`_ACTION_ID` 仍被 `apply_patch` 使用，保留。
- `agent-core/tests/test_tools.py`：EXPECTED 移除两个工具名，新增「审批不作为模型工具暴露」用例。
- `backend/tests/test_pat_auth.py`：新增 PAT approve/reject 403 + 待办保持 pending + `pat_human_session` denied 审计 + 不写 allowed 的用例，以及 cookie 会话审批正向用例。
- 文档：`docs/agent/agent-operation-api.md`（§1/§2/§6/§9/§13/§16）、`README.md` 信任边界与 PAT 示例、`agent-core/README.md` 信任边界、`SKILL.md`、`reference.md`、`docs/design.md`。
- 未改动 `execution_mode` 服务端解析、审批状态机、`decide_action` 现有校验与其它端点。

## Verification

红（改实现前）：

```console
$ uv run --directory backend pytest tests/test_pat_auth.py -q
3 failed, 11 passed, 2 warnings in 1.05s
# 失败证据：PAT approve 返回 200 且 state=approved；PAT reject 返回 200 且 state=rejected

$ cd agent-core && uv run pytest -q
4 failed, 66 passed in 0.10s
# 失败证据：TOOLS 仍含 approve_action / reject_action，specs=12 != EXPECTED=10
```

绿（改实现后）：

```console
$ uv run --directory backend pytest -q
171 passed, 4 warnings in 5.77s

$ cd agent-core && uv run pytest -q
70 passed in 0.08s

$ pnpm -C ui test
Test Files  22 passed (22)
     Tests  171 passed (171)

$ archkit inspect .
Quality gates passed.
```

## Related ADRs

- None.
