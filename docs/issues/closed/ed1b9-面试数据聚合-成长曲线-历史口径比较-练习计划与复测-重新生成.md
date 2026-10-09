---
id: ed1b9
status: closed
created_at: 2026-10-09T08:22:43.866Z
updated_at: 2026-10-09T10:10:06.342Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: A11 面试与能力提升
started_at: 2026-10-09T10:08:02.391Z
closed_at: 2026-10-09T10:10:06.342Z
---

# 面试数据聚合：成长曲线、历史口径比较、练习计划与复测、重新生成

## Background

A11 已经能建场、作答、生成带证据的报告，但报告是孤立的单场数据：没有跨场次的成长曲线，
没有「两场能不能放在一起比」的口径校验，没有把报告建议落成可复测的练习计划，也不能在
未作答前按筛选重新生成题目。这四块是 S1/S3 对外的能力承诺，仓库此前都没有实现。本工单
把已结束报告聚合成可复算的数据：成长曲线、口径比较、练习项与复测、重新生成、准备洞察。

## Scope

- `backend/app/modules/interview/**`：新增聚合与准备辅助接口、练习项模型与迁移、聚合视图。
- 新表 `practice_items`（`(source_report_id, dimension)` 唯一）与迁移 `a3c5e7f9b1d2`。
- 接口：
  - `GET /interview/growth`：按 role + rubric_version 聚合四维分数序列与平均值。
  - `GET /interview/comparison?a=&b=`：两场口径校验，不同口径返回 `connectable=false` 与原因。
  - `GET/POST /interview/practice-items`、`PATCH/DELETE /interview/practice-items/{id}`、
    `POST /interview/practice-items/{id}/retest`。
  - `POST /interview/sessions/{id}/regenerate`、`GET /interview/insights`。
- 前端：growth / history / plan 三屏接真接口，`ui/src/lib/interview.ts` 聚合客户端，
  `interviewGrowth` / `interviewHistory` / `interviewPlan` i18n 中英同步。
- `backend/tests/test_interview_aggregation.py` 覆盖全部聚合口径。

## Non-goals

- 不改评分量表与打分 prompt；聚合只读已冻结的 `rubric_version` 与报告分数。
- 不改 `ui/src/pages/interview-session.tsx`、session/voice/report 三屏（那是 4b40b）。
- 不新增权限码，沿用 `jd:read` / `jd:write`；不做跨用户数据聚合。

## Acceptance Criteria

- [x] 成长曲线按真实 `role + rubric_version` 分层聚合，跳过没有报告的场次，未指定 role 时返回空序列而不是报错。
- [x] 口径比较在 role 或 `rubric_version` 不一致时返回 `connectable=false` 与原因码，且拒绝他人场次。
- [x] 练习项由报告 `suggestions` 落库，`(source_report_id, dimension)` 幂等；可按 role 过滤；非法练习项被拒绝。
- [x] 复测复用建场链路起一场新会话并回写 `retest_session_id`；他人练习项被拒绝。
- [x] 未作答场次可重新生成并替换题目；已作答或已结束场次返回 409，历史题目与报告不变；他人场次被拒绝。
- [x] 准备洞察从真实简历版本与 JD 内容得到匹配/风险/范围；模型未配置返回 `MODEL_NOT_CONFIGURED`，模型输出非法返回 `MODEL_OUTPUT_INVALID`。
- [x] 前端三屏接真接口（MSW 钉住契约），成长曲线、口径比较、练习计划与复测状态都有测试；i18n 键结构一致。
- [x] `alembic heads` 单 head；`node quality-gates/run.js` 与 `archkit inspect .` 通过。

## Implementation

- `backend/app/modules/interview/service.py`：`list_growth`、`compare_sessions`、
  `materialise_practice_items`、`list_practice_items`、`update_practice_item`、
  `delete_practice_item`、`start_retest`、`regenerate_session`、`get_insights`，
  以及 `_caliber_key` / `_dimension_score_map` / `_session_average` / `_practice_item_view`
  等纯函数；聚合只读 `interview_sessions` + `interview_reports`，不改评分口径。
- `backend/app/modules/interview/api.py`：上述 9 个 handler，权限 `jd:read` / `jd:write`。
- `backend/app/modules/interview/models.py`：`PracticeItem`，`UniqueConstraint(source_report_id,
  dimension)` 保证重复 materialize 幂等，`retest_session_id` 指向复测场次。
- 迁移 `backend/migrations/versions/a3c5e7f9b1d2_create_practice_items_table.py`。
- `backend/app/modules/interview/schemas.py`：`InterviewGrowth*` / `InterviewComparison*` /
  `PracticeItem*` / `InterviewInsightsView` 等视图，`InterviewSessionSummary` 补
  `rubric_version`、`question_kinds`、`dimension_scores`、`average_score`。
- 前端：`growth-screen.tsx`（成长曲线与口径切换）、`history-screen.tsx`（场次历史与比较）、
  `plan-screen.tsx`（练习项、复测、重新生成、洞察）接 `ui/src/lib/interview.ts` 的真实函数；
  `interview-screens.test.tsx` 用 MSW 钉住契约。

说明：本文件同一提交还包含 f7eb9（题型/难度筛选与知识库依据注入）与 db9cc（报告导出）的
后端改动，三者的改动落在同一批 `interview/**` 文件上无法按文件拆分，合并提交时已在 commit
body 写明。

## Verification

- 聚合契约测试：`cd backend && .venv/bin/python -m pytest tests/test_interview_aggregation.py -q`
  → `18 passed`（成长曲线、口径比较、练习项落库与复测、重新生成 409、洞察错误码）。
- 全量回归：`cd backend && .venv/bin/python -m pytest -q` → `531 passed`。
- 前端：`pnpm -C ui test` → `73 files / 520 tests passed`；`pnpm -C ui exec tsc -b --noEmit` 退出码 0。
- 迁移：`cd backend && .venv/bin/python -m alembic heads` → 单 head `c4f1a9d2e6b3`。
- 门禁：`node quality-gates/run.js` → `Quality gates passed.`；`archkit inspect .` 同源通过。

## Related ADRs

- None.
