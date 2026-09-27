---
id: af02e
status: open
created_at: 2026-09-27T02:22:56.007Z
updated_at: 2026-09-27T02:22:56.007Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 数据模型
---

# 后端核心实体 CRUD 与 PostgreSQL 持久化

## Background

后端当前只有 health 模块，没有业务模型、迁移或业务端点。前端 `ui/src/lib/api.ts` 以 mock 镜像了 Profile、Resume、JD 的公共契约，`/profile`、`/resumes`、`/jds` 等页面因此无法脱离 mock。本工单把核心实体落到 PostgreSQL，并提供真实 CRUD。

## Scope

- 按 `app/modules/<domain>/` 模块制实现 Profile（含事实）、Resume（含文档与版本）、JobDescription 三个核心域的 REST CRUD 与软绑定。
- 统一机器错误码契约、单用户占位依赖、PostgreSQL 持久化与 Alembic 迁移。
- Template 作为只读支撑资源（GET /templates、GET /templates/{id}）与内置种子。
- 端点字段与 `ui/src/lib/types.ts` 对齐，便于后续前端切换。

## Non-goals

- 不实现对话 / Agent Run、配置、PAT / 开放接入、备份导入导出与工作台聚合。
- 不实现鉴权、多用户与权限 scope；使用固定本地用户占位。
- 不实现模板发布 / 下架等管理端写接口。
- 不接入前端：`ui/src/lib/api.ts` 维持 mock，切换另开工单。

## Acceptance Criteria

- [ ] backend 暴露 Profile/ProfileFact、Resume/文档/版本、JobDescription 的 CRUD 端点，字段与 `ui/src/lib/types.ts` 对齐。
- [ ] 数据持久化到 PostgreSQL，Alembic 迁移可从零升级到最新。
- [ ] 统一机器错误码契约覆盖资源不存在、绑定冲突、校验失败等路径。
- [ ] 子工单 d8c9f、ede13、0981a、a74d2 全部完成并关闭。
- [ ] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
