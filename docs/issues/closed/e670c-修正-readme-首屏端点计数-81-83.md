---
id: e670c
status: closed
created_at: 2026-10-01T09:40:00.000Z
updated_at: 2026-10-01T01:29:34.122Z
priority: low
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T09:40:30.000Z
closed_at: 2026-10-01T01:29:34.122Z
---

# 修正 README 首屏端点计数（81 -> 83）

## Background

README 首屏写着「11 个业务模块、81 个 HTTP 端点」，但实际端点已经到 83：25573 新增 `GET /resumes/{resume_id}/turns`（81 -> 82）、83c41 新增 `POST /resumes/{resume_id}/runs`（82 -> 83）。两次合并都没有更新这一行，而 `.freak` 的口径行已经写成 83，两处不一致。

## Scope

把 README 第 131 行的端点计数改为实测值 83，其余数字不动。

## Non-goals

- 不改代码、测试、契约或 `.freak`（`.freak` 的 83 已是正确值）。
- 不引入自动校验 README 数字的门禁（可作为后续工单）。

## Acceptance Criteria

- [x] README 首屏端点计数与 `grep -rhoE '@router\.(get|post|put|patch|delete)\(' backend/app | wc -l` 的实测值一致。
- [x] `archkit inspect .` 通过。

## Implementation

README 第 131 行：`81 个 HTTP 端点` -> `83 个 HTTP 端点`。

根因是两个工单各自只改了「验证与测试」段的测试计数与本工单涉及的其它文档，没有回头核对首屏那一句；而首屏那句自 25573 起就已经滞后一格。这类「同一数字散落多处、靠人记得同步」的问题在 `.freak` 里已有同类线索（`README.md` 数字口径一条），本次不新增机制。

## Verification

- 实测：`grep -rhoE '@router\.(get|post|put|patch|delete)\(' backend/app | wc -l` -> `83`，与 README 声明一致。
- `archkit inspect .` -> `Quality gates passed.`
- 本次只改 README 一行，未触碰代码与测试。

## Related ADRs

- None.
