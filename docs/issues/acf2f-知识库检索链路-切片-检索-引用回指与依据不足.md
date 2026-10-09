---
id: acf2f
status: in-progress
created_at: 2026-10-09T08:22:43.673Z
updated_at: 2026-10-09T10:08:02.391Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: A11 面试与能力提升
started_at: 2026-10-09T10:08:02.391Z
---

# 知识库检索链路：切片、检索、引用回指与依据不足

## Background

S2 把「后端从岗位知识库检索依据生成题目」列为 A11 的核心差异点，题库与面试出题也都在
题目上展示「依据 XX 文档 · XX 小节」。此前仓库没有任何知识库代码：没有文档/切片表、没有
检索实现、没有语料，题目里的依据只能靠模型自由发挥，无法追溯出处，也无法在「没有依据」时
如实显示。本工单把这条链路做成确定性、可离线复现、可回填引用的一整条：切片 → 检索 → 引用
回指 → 依据不足。

## Scope

- 新增 `backend/app/modules/kb/**`（api → service → dao → models）：文档导入与切片、
  `GET /kb/documents`、`POST /kb/documents`、`GET /kb/search`。
- 服务端切片：Markdown 按标题分节、纯文本整篇一节；段落累积到切片上限，超长段落按句末
  标点切、单句再超长按定长硬切；种子语料的免责声明行在切片时丢弃。
- 确定性 BM25 检索（中文按字符 bigram、英文按小写词，标题字段加权），无外部向量服务；
  无命中返回 `status=no_match` 与空结果。
- 种子语料：`backend/app/modules/kb/corpus/<role>/<topic>.md`，覆盖 java-backend 与
  web-frontend 两个岗位；导入脚本 `backend/scripts/seed_kb_corpus.py` 幂等。
- 引用回填：`backend/app/modules/kb/backfill.py` 与 `backend/scripts/backfill_knowledge_refs.py`，
  命中才写、未命中为空、默认跳过已带引用、`--force` 重算。
- 表 `kb_documents` / `kb_chunks`；迁移 `e6b2f8a4c7d1`。
- 前端：`ui/src/lib/kb-api.ts` 与题库屏检索面板（命中显示出处，未命中显示「依据不足」），
  中英 i18n 同步。

## Non-goals

- 不引入向量库、embedding 或任何外部检索服务；不加新的权限码（沿用 `resume:read` /
  `resume:write`）。
- 不修改 interview 的评分口径与出题 prompt；面试出题侧的注入由 f7eb9 负责。
- 不改写已有人工引用的题目（回填默认跳过，`--force` 才重算）。

## Acceptance Criteria

- [x] 切片口径确定且可测：Markdown 按标题分节、短段落合并、超长段落不丢字、空白文档被 422 拒绝、种子语料免责声明被丢弃。
- [x] `GET /kb/search` 是确定性 BM25，同数据同查询结果完全一致；无命中时 `status=no_match` 且 `results` 为空，不返回任何编造内容。
- [x] 检索按 `role` 隔离，短查询有覆盖率下限，弱重合与偶然子串不会误命中；结果 `limit` 与 `total` 语义正确。
- [x] 引用可回指：命中项含 `document_title`、`heading` 与可直接展示的 `source`（`文档标题 · 小节标题`）。
- [x] 语料覆盖两个岗位（java-backend / web-frontend）共 35 篇，`seed_kb_corpus.py` 按 `(title, role)` 幂等导入。
- [x] 回填命中才写 `knowledge_refs`、未命中保持为空、默认可重跑不覆盖人工引用、`--force` 整库重算并清空无命中项。
- [x] 权限：检索与列表需 `resume:read`，导入需 `resume:write`，无权限返回 403。
- [x] 前端题库屏检索面板接真接口：命中展示出处、未命中展示「依据不足」，zh-CN 与 en 键结构一致。
- [x] `node quality-gates/run.js` 与 `archkit inspect .` 通过。

## Implementation

- `backend/app/modules/kb/service.py`：切片（`split_document`）与检索（`search`）。
  - 切片上限 `MAX_CHUNK_CHARS=700`；`_chunk_section` 先按空行分段，段落超限时走
    `_split_long_paragraph`（按句末标点切，单句再超长按定长硬切），再把小段合并回上限。
  - 检索文本是「文档标题 + 小节标题 + 正文」，BM25 `k1=1.2, b=0.75`；再对文档标题与
    小节标题各做一次字段 BM25 并按 `TITLE_FIELD_WEIGHT=0.1` / `HEADING_FIELD_WEIGHT=1.4`
    加权（封顶 `LABEL_BONUS_CAP=2.2`、标题字段 `b=0`），只改排序不改召回。idf 用组合文本
    的文档频率，保证标题字段与正文同一套稀有度口径。
  - 覆盖率下限分两档：查询词 ≤ 6 用 `SHORT_QUERY_COVERAGE=0.7`（短查询是精确查找），
    否则用 `MIN_QUERY_COVERAGE=0.05`（弱兜底）；排序按 (分数降序, chunk id 升序) 保证可复现。
- `backend/app/modules/kb/api.py`：三个端点，权限沿用 `resume:read` / `resume:write`。
- `backend/app/modules/kb/backfill.py`：按「题干 + role」检索，命中写真实 `source`，未命中为
  `[]`；默认只填空题，`--force` 覆盖重算。脚本 `backend/scripts/backfill_knowledge_refs.py`
  与 `seed_kb_corpus.py`（含 `--coverage` 只读预演）共用同一实现。
- 迁移 `backend/migrations/versions/e6b2f8a4c7d1_create_kb_tables.py`：`kb_documents`（`body`
  保留原文，`chunk_count` 为真实切片数）与 `kb_chunks`（`heading` 记录小节、`char_count`
  记录切片长度）；`role` 在文档上、`document_id` 在切片上建索引。
- 前端 `ui/src/lib/kb-api.ts` 调 `GET /kb/search`；题库屏的检索面板展示 `source` 与
  `summary`，`status=no_match` 时展示「依据不足」；文案走 `interviewBank` 命名空间。

## Verification

- 后端契约测试：`cd backend && .venv/bin/python -m pytest tests/test_kb.py tests/test_kb_backfill.py tests/test_kb_corpus.py -q`
  → `74 passed`（切片边界、BM25 排序与覆盖率、role 隔离、no_match、权限、回填幂等、
  语料规格与幂等导入）。
- 语料规模：`find backend/app/modules/kb/corpus -name '*.md' | wc -l` → `35`；按 role 目录
  只接受 `java-backend` / `web-frontend`（`test_iter_corpus_rejects_unknown_role_dir`）。
- 引用回填：以 200 道题库真题运行回填，命中率 200/200、`no_match` 0；命中来源与
  `GET /kb/search?q=<题干>&role=<role>` 的 `sources` 逐条一致（与 f7eb9 的题目
  `knowledge_refs` 对账）。
- 全量回归：`cd backend && .venv/bin/python -m pytest -q` → `531 passed`；
  `pnpm -C ui test` → `73 files / 520 tests passed`；`pnpm -C ui exec tsc -b --noEmit` 退出码 0。
- 门禁：`node quality-gates/run.js` → `Quality gates passed.`；`archkit inspect .` 同源通过。

## Related ADRs

- None.
