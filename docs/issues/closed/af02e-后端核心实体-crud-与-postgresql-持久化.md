---
id: af02e
status: closed
created_at: 2026-09-27T02:22:56.007Z
updated_at: 2026-09-27T02:29:32.281Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 数据模型
started_at: 2026-09-27T02:29:26.772Z
closed_at: 2026-09-27T02:29:32.281Z
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

- [x] backend 暴露 Profile/ProfileFact、Resume/文档/版本、JobDescription 的 CRUD 端点，字段与 `ui/src/lib/types.ts` 对齐。
- [x] 数据持久化到 PostgreSQL，Alembic 迁移可从零升级到最新。
- [x] 统一机器错误码契约覆盖资源不存在、绑定冲突、校验失败等路径。
- [x] 子工单 d8c9f、ede13、0981a、a74d2 全部完成并关闭。
- [x] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

- 子工单：d8c9f（PostgreSQL、错误契约、单用户依赖、模板只读）、0981a（Resume CRUD 与文档版本）、a74d2（JD CRUD 与软绑定）、ede13（Profile 与事实 CRUD），均已单提交关闭。
- 模块：`app/modules/{templates,resume,jd,profile}/` 均按 `api → service → dao → models` 分层，`app/main.py` 显式注册 4 个 router 与 2 个异常处理器。
- 迁移：`templates` → `resumes/resume_versions` → `job_descriptions` → `profiles/profile_facts` 四个 Alembic revision 串联。
- 契约：`app/shared/schemas.py` 的 camelCase `ApiModel` 基类 + `app/shared/errors.py` 的 `ApiError` 信封，字段对齐 `ui/src/lib/types.ts`。
- 文档：`docs/design.md` 增补核心实体接口、数据模型表与目录结构；`backend/README.md` 增补模块与本地 PostgreSQL 步骤。

## Verification

- `uv run --directory backend pytest -q`：35 passed（health 3、deps 1、templates 3、resume 11、jd 10、profile 8）。
- 从零迁移：`dropdb/createdb resumate_verify` 后 `DATABASE_URL=... alembic upgrade head` 退出码 0；`pg_tables` 列出 alembic_version、job_descriptions、profile_facts、profiles、resume_versions、resumes、templates 共 7 张表。
- OpenAPI：`/openapi.json` 注册 18 条路径，覆盖 templates、resumes（含 document/versions/archive/restore/duplicate）、jds（含 binding）、profile（含 facts）。
- `archkit inspect .`：Quality gates passed。
- 遗留：`archkit inspect -s fastapi` 官方专项门禁未同步（`.freak` 已记录的 generic-only 现状）；前端仍使用 mock，切换为独立工单。

## Related ADRs

- None.
