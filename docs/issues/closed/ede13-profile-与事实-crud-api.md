---
id: ede13
status: closed
created_at: 2026-09-27T02:22:57.728Z
updated_at: 2026-09-27T02:28:55.299Z
priority: high
labels: []
parent: af02e
blocked_by: []
design_section: 数据模型
started_at: 2026-09-27T02:28:07.882Z
closed_at: 2026-09-27T02:28:55.299Z
---

# Profile 与事实 CRUD API

## Background

`/profile` 页面需要读取职业事实库，并支持直接编辑基本信息与事实。前端 `lib/api.ts` 已有 mock 契约，后端没有对应的持久化与 CRUD。

## Scope

- `Profile` 与 `ProfileFact` 模型（PostgreSQL），字段对齐 `ui/src/lib/types.ts`。
- `GET /profile`：不存在时按当前用户创建空 Profile 并返回完整对象（含 basics、facts、versions）。
- `PATCH /profile/basics`：更新基本信息。
- 事实 CRUD：`GET /profile/facts`、`POST /profile/facts`、`GET /profile/facts/{fact_id}`、`PATCH /profile/facts/{fact_id}`、`DELETE /profile/facts/{fact_id}`。
- 新增事实默认 `evidence.status=unverified`（BR-D09），仅显式传入 `verified` 才是已核实。
- 删除事实前计算 `referencedBy`（依据 Resume 版本快照中的 fact id）并返回影响摘要。

## Non-goals

- 不实现对话解析 `POST /profile:parse-input`（Agent 能力）。
- 不实现 match-job、resume-drafts 与 Profile 版本 diff/restore。
- 不实现前端接入。

## Acceptance Criteria

- [x] `GET /profile` 返回 Profile（含 basics、facts、versions），首次访问自动创建且幂等。
- [x] `PATCH /profile/basics` 更新后回读一致。
- [x] 事实四种 CRUD 端点可用，PATCH 支持部分字段更新，删除返回反向引用影响。
- [x] 新增事实默认 `unverified`，显式传 `verified` 才标记已核实。
- [x] 资源不存在返回统一 404 错误码，不泄露其他用户数据。
- [x] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

- 模型与迁移：`app/modules/profile/models.py` 定义 `profiles` 与 `profile_facts`；`migrations/versions/bd9575fb5b92_create_profile_tables.py` 建表。
- 分层：`app/modules/profile/` 按 `api → service → dao → models` 落地；`get_or_create_profile` 保证单用户下幂等创建。
- 端点：GET /profile、PATCH /profile/basics、事实 list/create/get/patch/delete，共 7 条。
- 证据语义：`POST` 缺省 evidence 为 `{status: unverified}`，confidence 0.5；显式 `verified` 时写 `verifiedAt` 且 confidence 0.9。
- 反向引用：`profile.service.reference_index` 扫描当前用户全部 `ResumeVersion.snapshot` 的 `entries[].provenance.factId`，一次构建 fact → 版本映射；`DELETE` 返回 `FactDeletionImpact`。
- basics 更新复用 `ResumeBasics` 契约并以 camelCase 存入 JSON；completeness 按 5 个基础字段 + links 占 60、事实数占 40 计算。
- Profile 版本历史未落地，响应 `versions` 暂为空数组（Non-goals 已声明版本 diff/restore 不在本期）。

## Verification

- `uv run pytest -q`：35 passed（新增 Profile 8 项：幂等创建、basics 与 completeness、默认 unverified、显式 verified、更新与 type 过滤、404、删除返回 Resume 版本反向引用）。
- `uv run alembic upgrade head`：退出码 0；`resumate` 库出现 `profiles`、`profile_facts`，共 7 张表。
- 删除事实用例断言 `referencedBy` 精确指向 `{resumeId, resumeTitle, versionId}`，且删除后 Resume 仍可读取。
- `archkit inspect .`：Quality gates passed。

## Related ADRs

- None.
