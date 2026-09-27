---
id: a74d2
status: open
created_at: 2026-09-27T02:22:57.907Z
updated_at: 2026-09-27T02:22:57.907Z
priority: high
labels: []
parent: af02e
blocked_by: [d8c9f, 0981a]
design_section: 数据模型
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

- [ ] JD CRUD 全通，PATCH 后 revision 递增且 updatedAt 更新。
- [ ] 保存时校验 role 与 body 非空。
- [ ] 绑定 / 换绑 / 解绑只改关联元数据，不产生 ResumeVersion。
- [ ] 绑定目标不存在、已删除或非当前用户时返回统一错误并保留原绑定。
- [ ] 删除 JD 后 Resume 与版本仍可读取。
- [ ] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
