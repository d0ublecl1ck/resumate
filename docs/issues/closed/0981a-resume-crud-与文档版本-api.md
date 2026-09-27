---
id: 0981a
status: closed
created_at: 2026-09-27T02:22:57.816Z
updated_at: 2026-09-27T02:26:56.014Z
priority: high
labels: []
parent: af02e
blocked_by: []
design_section: 数据模型
started_at: 2026-09-27T02:25:54.124Z
closed_at: 2026-09-27T02:26:56.014Z
---

# Resume CRUD 与文档版本 API

## Background

`/resumes`、`/resume-editor`、`/resume-versions` 依赖 Resume 资源、文档与版本，后端缺少持久化和 CRUD。

## Scope

- `Resume`、`ResumeVersion` 模型，文档（basics、sections、entries）以 JSON 列存储。
- 元数据 CRUD：`GET /resumes`（lifecycle/query/tag 过滤）、`POST /resumes`、`GET /resumes/{resume_id}`、`PATCH /resumes/{resume_id}`、`DELETE /resumes/{resume_id}`（软删除并返回 restoreDeadline）。
- 生命周期：`POST /resumes/{resume_id}/archive`、`POST /resumes/{resume_id}/restore`、`POST /resumes/{resume_id}/duplicate`。
- 文档与版本：`GET /resumes/{resume_id}/document`、`PUT /resumes/{resume_id}/document`（提交新版本）、`GET /resumes/{resume_id}/versions`。
- 元数据修改不产生版本；文档提交产生 `ResumeVersion` 并更新 `currentVersionId`。
- `templateId` 必须指向已发布模板；`boundByJdIds` 返回 JD 反向关联。

## Non-goals

- 不实现 Working Copy / flush / finalize / patch 聚合（C-03、C-05 完整模型）。
- 不实现 undo/redo、版本 restore、PDF/Markdown/JSON 导出。
- 不实现按 JD 微调与选材生成。

## Acceptance Criteria

- [x] Resume 元数据 CRUD 全通；软删除后默认列表不可见且返回恢复截止。
- [x] duplicate 生成新 Resume，文档与版本独立于原稿。
- [x] `PUT document` 产生一个新版本并更新 `currentVersionId`；元数据 PATCH 不产生版本。
- [x] `GET /resumes` 支持 lifecycle/query/tag 过滤并按 updatedAt 倒序。
- [x] `templateId` 不存在或未发布时返回统一校验错误。
- [x] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

- 模型与迁移：`app/modules/resume/models.py` 定义 `resumes` 与 `resume_versions`；`migrations/versions/465b7e6f13db_create_resume_tables.py` 建表。
- 分层：`app/modules/resume/` 按 `api → service → dao → models` 落地；DAO 只做查询与写入，service 负责模板校验、生命周期、版本提交与基线冲突。
- 端点：列表/创建/详情/元数据 PATCH/软删除/archive/restore/duplicate，document GET/PUT，versions GET，共 11 条。
- 版本语义：元数据 PATCH 不产生版本；文档 PUT 产生 `ResumeVersion`（记录 message、changeCount、affectedSections、snapshot、parent/base）并更新 `currentVersionId`；内容无变化时返回原对象不建版本；`baseVersionId` 过期返回 409 `BASE_VERSION_STALE`。
- 软删除：`lifecycle=deleted` 且 `restoreDeadline` 为 30 天后；超过期限 restore 被拒绝。
- `boundByJdIds` 在 JD 模块落地前返回空数组，反向填充放到 JD 工单（a74d2）。

## Verification

- `uv run pytest -q`：18 passed（health 3、templates 3、deps 1、resume 11），0.18s。
- `uv run alembic upgrade head`：退出码 0；`resumate` 库出现 `resumes`、`resume_versions`、`templates`、`alembic_version`。
- 覆盖用例：初始版本、未知/已下架模板、元数据 PATCH 不建版本、文档 PUT 建版本与 affectedSections、过期 baseVersionId 409、软删除与恢复、归档与恢复、复制独立性、query/tag 过滤、404 错误码。
- `archkit inspect .`：Quality gates passed。

## Related ADRs

- None.
