---
id: "25573"
status: closed
created_at: 2026-10-01T03:00:00.000Z
updated_at: 2026-10-01T01:22:04.575Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:19:40.693Z
closed_at: 2026-10-01T01:22:04.575Z
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

- [x] `GET /resumes/{resume_id}/turns` 支持可选 `state`，按创建时间倒序返回 `UserTurnResponse[]`（含 pendingActions）。
- [x] owner 隔离：他人会话 404；简历缺失/越权 404；无匹配轮次返回 `[]`。
- [x] 后端 TDD：先构造「open 轮次 + 待办、未 apply」场景断言列表能找到，再实现。
- [x] 前端 `getActiveRun` 用列表端点；新增「working_turn_id 为空但有待办时仍能找到」测试。
- [x] `UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q` 现有 182 条不退化；`pnpm -C ui test` 现有 27 files / 199 条不退化；`archkit inspect .` 通过。

## Implementation

选择方案 B（新增列表端点），理由：同一端点既满足「取当前 open 轮次」（前端取最近一条）又满足将来的「轮次列表」；并把「发现轮次」与「working copy 归属」解耦——后者的语义（谁占有暂存）本来就不该承担轮次发现。方案 A 只能返回单值，且会继续把两个概念混在 working-document 上。

- `backend/app/modules/agent/dao.py`：新增 `list_turns(db, resume_id, owner_id, state=None, limit=100)`，按 `created_at desc, id desc` 排序，可选 state 过滤，按 owner 过滤。
- `backend/app/modules/agent/service.py`：新增 `list_turns(db, user, resume_id, state)`，先 `resume_service.get_resume`（简历缺失/越权 404），再按 owner 列出并映射为 `UserTurnResponse`（含 pendingActions）。
- `backend/app/modules/agent/api.py`：新增 `GET /resumes/{resume_id}/turns`，权限 `resume:read`，可选 query `state`（复用 `TurnState`）。
- `backend/tests/test_agent_turns_list.py`（5 条）：preview-only open 轮次可发现（并断言此时 working-document.userTurnId 为 None）、state 过滤与倒序、owner 隔离、空列表与缺失简历 404、非法 state 422。
- `ui/src/lib/api.ts`：`getActiveRun` 改为 `GET /resumes/{id}/turns?state=open` 取第一条，再读 `/turns/{id}/state` 预算；不再经 working-document。
- `ui/src/mocks/handlers.ts`：新增 `GET /api/resumes/:id/turns` handler，抽取共享 `MOCK_TURN`。
- `ui/src/lib/run-api.test.ts`：改为断言列表端点调用与映射，并新增「working copy 为空但存在 preview-only 待办轮次」用例。
- 文档：契约 §6 新增端点与语义；README 后端 182->187、端点 81->82；`.freak` 数字口径同步并标记该缺口已解决。

## Verification

红（实现前）：`tests/test_agent_turns_list.py` 5 failed（端点不存在）；`run-api.test.ts` 2 failed（仍走 working-document，preview-only 返回 undefined）。

绿：

```console
$ UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q
187 passed, 4 warnings in 6.17s

$ pnpm -C ui test
Test Files  27 passed (27)
     Tests  199 passed (199)

$ archkit inspect .
Quality gates passed.
```

基线为后端 182、前端 27 files / 199，无退化（后端 +5）。

## Related ADRs

- None.
