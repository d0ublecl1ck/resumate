---
id: a74d2
status: closed
created_at: 2026-09-27T02:22:57.907Z
updated_at: 2026-09-27T02:27:53.568Z
priority: high
labels: []
parent: af02e
blocked_by: []
design_section: 数据模型
started_at: 2026-09-27T02:27:08.864Z
closed_at: 2026-09-27T02:27:53.568Z
---

# JD CRUD 与软绑定 API

## Background

`/jds`、`/jd-detail` 与编辑器依赖 JD 列表、详情与到 Resume 的软绑定；后端缺少持久化与 CRUD。

## Scope

- `JobDescription` 模型，字段含 ownerId、role、company、body、sourceUrl、tags、revision、createdAt、updatedAt、boundResumeId。
- CRUD：`GET /jds`（query/tag 过滤）、`POST /jds`、`GET /jds/{jd_id}`、`PATCH /jds/{jd_id}`（revision 递增）、`DELETE /jds/{jd_id}`。
- 软绑定：`PUT /jds/{jd_id}/binding`（设置或原子替换）、`DELETE /jds/{jd_id}/binding`（解除）。
- 绑定校验 JD 与 Resume 同属当前用户且 Resume 未删除；响应提供 `boundResumeAvailable`。

## Non-goals

- 不实现 `POST /jds:parse-text` 与 `POST /jds:parse-image`（Agent / OCR）。
- 不实现候选简历匹配与针对性微调。
- 不实现 JD 历史 revision 表与快照。

## Acceptance Criteria

- [x] JD CRUD 全通，PATCH 后 revision 递增且 updatedAt 更新。
- [x] 保存时校验 role 与 body 非空。
- [x] 绑定 / 换绑 / 解绑只改关联元数据，不产生 ResumeVersion。
- [x] 绑定目标不存在、已删除或非当前用户时返回统一错误并保留原绑定。
- [x] 删除 JD 后 Resume 与版本仍可读取。
- [x] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

- 模型与迁移：`app/modules/jd/models.py` 定义 `job_descriptions`；`migrations/versions/ab5564e4c8af_create_job_description_table.py` 建表。
- 分层：`app/modules/jd/` 按 `api → service → dao → models` 落地；非空校验由 schema 负责，归属与绑定校验在 service。
- 端点：列表/创建/详情/PATCH/DELETE，PUT binding 设置或替换，DELETE binding 解除。
- 绑定语义：设置前先用 `resume.dao.get_resume` 校验目标属于当前用户且 `lifecycle != deleted`，校验失败不修改原绑定；`PATCH` 每次递增 revision；`DELETE` 只删 JD 记录与当前绑定。
- 反向关联：新增 `jd.dao.list_jd_ids_for_resume`，Resume 响应通过 `resume.service.list_bound_jd_ids` 填充 `boundByJdIds`。
- 错误契约：`app/main.py` 增加 `RequestValidationError` 处理器，schema 校验失败也返回 `VALIDATION_FAILED` 信封。

## Verification

- `uv run pytest -q`：28 passed（新增 JD 10 项：创建、空值校验、revision、query/tag 过滤、删除、绑定反向引用、换绑与解绑、未知简历保留原绑定、已删除简历拒绝、删除 JD 不删 Resume）。
- `uv run alembic upgrade head`：退出码 0；`resumate` 库出现 `job_descriptions`，与 resumes、resume_versions、templates、alembic_version 并存。
- 绑定测试断言绑定后 Resume 版本数仍为 1，确认软绑定不产生 ResumeVersion。
- `archkit inspect .`：Quality gates passed。

## Related ADRs

- None.
