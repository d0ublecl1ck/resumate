---
id: d8c9f
status: closed
created_at: 2026-09-27T02:22:57.641Z
updated_at: 2026-09-27T02:25:13.843Z
priority: high
labels: []
parent: af02e
blocked_by: []
design_section: 架构
started_at: 2026-09-27T02:23:27.738Z
closed_at: 2026-09-27T02:25:13.843Z
---

# 后端 CRUD 基础设施：PostgreSQL、错误契约与单用户依赖

## Background

后端默认 `DATABASE_URL` 为 sqlite，`get_current_user` 仍抛 `NotImplementedError`，且没有统一错误模型与业务测试基础设施，核心实体 CRUD 无法落地。本工单先打通 PostgreSQL、错误契约、单用户依赖与测试夹具。

## Scope

- 引入 psycopg 驱动，默认 `DATABASE_URL` 改为 PostgreSQL，同步 `.env.example` 与 `backend/README.md`。
- 实现 `get_current_user` 单用户占位依赖，返回固定本地用户；不引入认证。
- 在 `app/shared/` 定义机器错误码、领域异常与 `ApiError` 响应模型，在 `app/main.py` 注册异常处理器。
- 建立 `templates` 表与只读 `GET /templates`、`GET /templates/{id}`，提供内置模板种子任务。
- 建立 PostgreSQL 测试基础设施：会话回滚 fixture、`get_db` 依赖覆盖。
- 更新 `docs/design.md` 的数据模型、目录结构与关键决策。

## Non-goals

- 不实现 Profile / Resume / JD 业务端点（后续子工单）。
- 不实现模板管理端写接口。
- 不实现认证、Token、多用户与权限 scope。

## Acceptance Criteria

- [x] `DATABASE_URL` 默认 PostgreSQL，`uv` 依赖含 psycopg，`.env.example` 与 README 同步。
- [x] `get_current_user` 返回固定本地用户，不再抛 `NotImplementedError`。
- [x] 统一错误响应 `{code, message, latestVersionId?}` 至少被一个真实端点路径覆盖并测试。
- [x] `templates` 表可由 Alembic 创建，`GET /templates` 返回种子模板。
- [x] 测试夹具提供 PostgreSQL 会话并在每个测试后回滚，测试不污染运行库。
- [x] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

- 依赖与配置：`backend/pyproject.toml` 增加 `psycopg[binary]`；`app/core/config.py` 默认 `postgresql+psycopg://localhost:5432/resumate`；`.env.example` 增加 `TEST_DATABASE_URL`。
- 单用户依赖：`app/core/deps.py` 定义 `CurrentUser` 与 `LOCAL_USER`，`get_current_user` 固定返回 `user_local`。
- 错误契约：`app/shared/schemas.py` 提供 camelCase 线协议基类 `ApiModel`；`app/shared/errors.py` 定义 `ErrorCode`、`ApiError`、`ApiException` 与 `ResourceNotFound`/`ValidationFailed`/`BaseVersionStale`；`app/main.py` 注册异常处理器输出统一信封。
- 模板只读域：`app/modules/templates/` 按 `api → service → dao → models` 落地，`GET /templates`、`GET /templates/{template_id}`；`app/tasks/seed.py` 幂等写入两个内置模板。
- 迁移：`migrations/env.py` 导入模板模型，生成 `migrations/versions/ccb808fe65a4_create_templates_table.py`。
- 测试：`tests/conftest.py` 用 `TEST_DATABASE_URL` 建 schema、写种子、每个测试事务回滚并覆盖 `get_db`；新增 `tests/test_templates.py`、`tests/test_deps.py`。
- 文档：同步 `backend/README.md` 与 `docs/design.md`（数据模型、目录结构、关键决策）。

## Verification

- `uv run pytest -q`：7 passed（health 3、templates 3、deps 1），0.08s。
- `uv run alembic upgrade head`（运行库 `resumate`）：退出码 0；`\dt` 显示 `templates` 与 `alembic_version`。
- `uv run python -m app.tasks.seed`：`seeded 2 template(s)`；查询 `templates` 返回 `tpl_classic`/`tpl_modern` 均为 `published`。
- `archkit inspect .`：`Quality gates passed.`。
- 说明：`archkit inspect -s fastapi` 提示官方门禁未同步，属 `.freak` 已记录的 generic-only 现状，未在本工单引入门禁同步。

## Related ADRs

- None.
