---
id: f7eb9
status: closed
created_at: 2026-10-09T09:47:00.219Z
updated_at: 2026-10-09T10:10:03.927Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: AI 模拟面试闭环（已实现）
started_at: 2026-10-09T09:47:09.268Z
closed_at: 2026-10-09T10:10:03.927Z
---

# 面试出题补全：项目深挖题型、难度题型筛选与知识库依据注入

## Background

独立审计确认 US-14.1（EXT）只做到部分实现，缺口都在「面试出题」这条链路：

1. `backend/app/modules/interview/service.py` 的 `QUESTION_KINDS` 只有 `technical / behavioral / situational`，`_QUESTION_SYSTEM` 同样限定三类；US-14.1 要求题目包含技术、项目深挖、场景、行为四类。题库模块（bank）已有 `technical / deep_dive / scenario / behavioral` 四类，缺的只是面试出题。
2. `POST /interview/sessions` 与 `POST /interview/sessions/{id}/regenerate` 不接受 difficulty / kind 参数；US-14.1 场景二要求按岗位、难度和题型筛选后重新生成，并保留筛选条件、不改写此前练习记录中的题目快照。
3. `interview` 模块不引用知识库，US-14.2 / S2 声称的「后端从岗位知识库检索依据生成题目」只在题库回填里落地，面试出题没有 RAG。

## Scope

- `backend/app/modules/interview/**`：题型白名单与出题 prompt、建场/重新生成的 difficulty 与 kinds 参数、题目 difficulty 与 knowledge_refs 落库与对外视图、复用 `kb.service.search` 的检索注入。
- `backend/app/modules/interview/models.py` 与新增 Alembic 迁移：`interview_questions` 增加 `difficulty`、`knowledge_refs` 两列（可空，历史行为空）。
- `backend/tests/test_interview*.py`：覆盖四类题型、难度/题型筛选与重新生成 409、筛选保留、RAG 命中与未命中、向后兼容。
- `ui/src/features/interview/{questions,session,setup}-screen.tsx` 及对应 stories / i18n：第四类题型徽标、难度与题型筛选接真实 regenerate 参数、题目详情展示知识来源。
- `ui/prototypes/index.html` 对应屏：题型筛选与题目详情「依据 XX 文档 · XX 小节」。

## Non-goals

- 不修改 `backend/app/modules/kb/**` 的检索实现与阈值（刚冻结），只读调用既有 `service.search`。
- 不修改 `ui/src/pages/interview-session.tsx` 与 `features/interview/{voice,report,bank,growth,history,plan}-screen.tsx`。
- 不改写历史题目的 kind；不迁移历史 `situational` 数据。
- 不重启 8000，不做 git 写操作。
- 不新增第二套检索实现，不新增权限码。

## Acceptance Criteria

- [x] 面试出题题型白名单与 `_QUESTION_SYSTEM` 覆盖 `technical / deep_dive / scenario / behavioral` 四类；旧 `situational` 仍被接受并按历史数据显示。
- [x] `POST /interview/sessions` 与 `POST /interview/sessions/{id}/regenerate` 接受可选 `difficulty`（easy/medium/hard）与 `kinds` 数组；不传保持现状行为。
- [x] 生成题目带 `difficulty`（未指定为 null）与 `knowledge_refs`（list[str]，与 bank 同构；未命中为空数组）。
- [x] 带筛选创建的会话把筛选存入 `contextSnapshot.generationFilters` 并在 detail 的 `filters` 暴露；regenerate 不传参数时沿用已存筛选。
- [x] 对已作答或已结束会话 regenerate 返回 409，历史题目快照与已生成报告不变。
- [x] 出题时按岗位 + JD/简历要点调用 `kb.service.search` 取 top-k 切片注入「知识依据」；每道题按其题干检索记录命中来源，未命中不伪造引用。
- [x] 前端题型徽标支持第四类，questions 屏筛选控件把 kinds/difficulty 传给 regenerate，题目详情展示「依据 XX 文档 · XX 小节」或「依据不足」。
- [x] 向后兼容：不传新参数时接口行为与现状一致（既有测试全绿）。

## Implementation

- 后端 `interview/schemas.py`：`QUESTION_KINDS = ("technical","deep_dive","scenario","behavioral")` 与历史别名 `situational → scenario`；`InterviewSessionCreate` / `InterviewSessionRegenerate` 增加可选 `difficulty`（easy/medium/hard）与 `kinds`（自动去重、归一）；新增 `InterviewGenerationFilters`、`InterviewQuestionView.difficulty / knowledge_refs`、`InterviewSessionDetail.filters`。
- 后端 `interview/service.py`：`_QUESTION_SYSTEM` 要求覆盖指定题型并按难度出题；`_generate_questions` 出题前用 `kb.service.search` 按「岗位 + JD/简历要点」取 top-5 切片作为「知识依据」注入 prompt，生成后按每题题干再检索一次写 `knowledge_refs`（与 `kb/backfill.py` 同口径）；题型越界丢弃、低于 3 题报 `MODEL_OUTPUT_INVALID`；`create_session` / `regenerate_session` / `start_retest` 统一按筛选出题并把 `generationFilters` 冻结进 `context_snapshot`；regenerate 不传参数沿用已冻结筛选，已作答/已结束仍 409。
- 后端 `interview/models.py` + 迁移 `c4f1a9d2e6b3`：`interview_questions` 增加可空 `difficulty`、`knowledge_refs`，历史行保持 NULL。
- 后端 `interview/api.py`：regenerate 接受可选 body。
- 前端 `lib/interview.ts`：题型补 `deep_dive/scenario`（保留 `situational` 旧值）、`regenerateInterviewSession(id, input)`；`questions-screen.tsx` 增加难度/题型筛选并驱动 regenerate、读取会话已冻结筛选回填、展示第四类徽标与「依据 XX 文档 · XX 小节 / 依据不足」；`interviewWorkflow` i18n 补第四类徽标；story 与原型同步。
- 依赖方向：`interview` 在 service 层只读调用 `kb.service.search`，与既有 `interview → jd/resume/speech` 的服务层调用同构，`kb` 不反向依赖 `interview`，方向可接受。

## Verification

- 新增 `tests/test_interview_generation_filters.py`（11 passed）：真实 HTTP（本地假模型服务）+ 真实 BM25 检索，覆盖四类题型、难度、筛选保留、regenerate 409、RAG 对账与未命中。
- 原始 HTTP 证据（`POST /interview/sessions` kinds=4 difficulty=hard）：`STATUS 201`，四类 `technical/deep_dive/scenario/behavioral` 均 `difficulty=hard`，`filters={"difficulty":"hard","kinds":[...]}`；技术题 `knowledgeRefs=["Spring 事务管理 · 失效场景"]`。
- RAG 对账：`GET /kb/search?q=<该题题干>&role=Java 后端` 返回 `status=matched`，`sources=["Spring 事务管理 · 失效场景"]`，与题目 `knowledgeRefs` 完全一致。
- 未命中：role=机器学习工程师（语料外）建场 `STATUS 201`，四题 `knowledgeRefs=[[],[],[],[]]`，不伪造引用。
- `backend/.venv/bin/python -m pytest -q --ignore=tests/test_rubric_consistency.py` → **514 passed**（`test_rubric_consistency.py` 是并行任务半成品，缺 `scripts/audit_rubric_consistency.py`，非本次改动）。
- `pnpm -C ui test` → **73 files / 520 tests passed**；`npx tsc -b --noEmit` → 退出码 0；`pnpm run build-storybook` → `Storybook build completed successfully`。
- `node quality-gates/run.js` 与 `archkit inspect .` → `Quality gates passed.`；`alembic heads` 单 head `c4f1a9d2e6b3`。
- `bash scripts/check-residue.sh`：无头浏览器 none；本任务未起 dev server，:/tmp 脚本与 5173/6007 端口非本任务残留。


## Related ADRs

- None.
