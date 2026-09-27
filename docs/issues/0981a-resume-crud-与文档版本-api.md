---
id: 0981a
status: open
created_at: 2026-09-27T02:22:57.816Z
updated_at: 2026-09-27T02:22:57.816Z
priority: high
labels: []
parent: af02e
blocked_by: [d8c9f]
design_section: 数据模型
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

- [ ] Resume 元数据 CRUD 全通；软删除后默认列表不可见且返回恢复截止。
- [ ] duplicate 生成新 Resume，文档与版本独立于原稿。
- [ ] `PUT document` 产生一个新版本并更新 `currentVersionId`；元数据 PATCH 不产生版本。
- [ ] `GET /resumes` 支持 lifecycle/query/tag 过滤并按 updatedAt 倒序。
- [ ] `templateId` 不存在或未发布时返回统一校验错误。
- [ ] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
