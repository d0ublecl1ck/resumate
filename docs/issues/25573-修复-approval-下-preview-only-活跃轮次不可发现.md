---
id: "25573"
status: in-progress
created_at: 2026-10-01T03:00:00.000Z
updated_at: 2026-10-01T01:19:40.693Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:19:40.693Z
---

# 修复 approval 下 preview-only 活跃轮次不可发现

## Background

- `GET /resumes/{id}/working-document` 的 `userTurnId` 来自 `resume.working_turn_id`，只在 apply / rebase 落暂存时写入。
- approval 模式下 `preview_patch` 只创建 PendingAction、不 stage，因此「已有待办、尚未 apply」的 open 轮次无法被发现：前端 `getActiveRun` 返回 undefined，审批卡在首次 apply 前不可见。
- 证据：`grep -n stage_working_document backend/app/modules/agent/service.py` -> 只在 :144（rebase）与 :574（apply）调用。

## Scope

- 选择方案 B：新增 `GET /resumes/{resume_id}/turns?state=open` 列表端点（owner 隔离；可选 `state` 过滤；按创建时间倒序；无匹配返回 `[]`；简历缺失/越权返回 404）。
- 契约 `docs/agent/agent-operation-api.md` 同步该端点与语义。
- 前端 `ui/src/lib/api.ts` 的 `getActiveRun` 改用该列表取最近一条 open 轮次，使 preview-only 的待审批轮次也能被发现；补对应测试。
- README 端点计数与 `.freak` 线索按实测同步。

## Non-goals

- 不改 apply/preview 语义，不改 working-document 的既有字段。
- 不动主工作区与 agent-core。
- 不新增页面视觉规则。

## Acceptance Criteria

- [ ] `GET /resumes/{resume_id}/turns` 支持可选 `state`，按创建时间倒序返回 `UserTurnResponse[]`（含 pendingActions）。
- [ ] owner 隔离：他人会话 404；简历缺失/越权 404；无匹配轮次返回 `[]`。
- [ ] 后端 TDD：先构造「open 轮次 + 待办、未 apply」场景断言列表能找到，再实现。
- [ ] 前端 `getActiveRun` 用列表端点；新增「working_turn_id 为空但有待办时仍能找到」测试。
- [ ] `UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q` 现有 182 条不退化；`pnpm -C ui test` 现有 27 files / 199 条不退化；`archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
