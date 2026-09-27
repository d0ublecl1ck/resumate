# backend

## 启动

先准备 PostgreSQL 与 Redis（本机 Homebrew 为例）。

```bash
brew services start postgresql@18
createdb resumate
createdb resumate_test
brew services start redis
```

在本目录执行：

```bash
uv sync
uv run alembic upgrade head
uv run python -m app.tasks.seed   # 内置模板 + 本地管理员 admin@resumate.dev / resumate-admin
uv run uvicorn app.main:app --reload
```

`GET /health/`：数据库探活成功返回 `200 {"status":"ok"}`，连接失败返回 `500 Internal Server Error`。文档：`/docs`；OpenAPI：`/openapi.json`。

## 配置

配置统一由 `app/core/config.py` 读取环境变量和 `.env`。`APP_NAME` 为应用标题；`DATABASE_URL` 默认 `postgresql+psycopg://localhost:5432/resumate`，使用 psycopg 3 驱动；`REDIS_URL` 默认 `redis://localhost:6379/0`。测试通过 `TEST_DATABASE_URL` 指向隔离测试库。

会话相关配置：`SESSION_TTL_SECONDS`（默认 7 天）、`SESSION_COOKIE_NAME`、`SESSION_COOKIE_SECURE`（生产 HTTPS 必须为 `true`）、`SESSION_COOKIE_SAMESITE`。bootstrap 管理员由 `BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD / BOOTSTRAP_ADMIN_NAME` 控制，仅在账号不存在时创建。

## 架构

- `app/main.py`：显式导入和注册模块 router，并注册统一异常处理器。
- `app/core/`：Settings、数据库引擎与请求会话、Redis 客户端、同步探活依赖、分页参数与 `CurrentUser` 类型。
- `app/modules/<domain>/`：业务域按 `api → service → dao → models` 分层，schemas 定义接口契约。
- `app/modules/auth/`：账号与 Opaque Token 会话；`session_store.py` 封装 Redis key 与撤销，`security.py` 负责 argon2 哈希，`deps.py` 提供 `get_current_user` / `require_admin`。端点：`POST /auth/register|login|logout|password`、`GET /auth/me`、`POST /auth/users/{user_id}/ban`（仅管理员；改密码与封号会删除该用户全部会话 key）。
- `app/modules/templates/`：模板只读查询，当前不含管理端写接口。
- `app/modules/resume/`：简历元数据 CRUD、软删除/归档/恢复/复制、文档提交与版本列表。
- `app/modules/jd/`：岗位 CRUD 与到简历的 0..1 软绑定。
- `app/modules/profile/`：职业事实库、基本信息与事实 CRUD，删除返回反向引用。
- `app/shared/`：至少两个模块复用的领域对象；`schemas.py` 提供 camelCase 线协议基类，`errors.py` 提供机器错误码、领域异常与 `ApiError` 信封。core 和 shared 不反向依赖 modules。
- `app/jobs/`：长时或定时作业；`app/tasks/seed.py`：内置参考数据幂等种子。
- `migrations/`：Alembic 环境；`tests/`：接口验证。

业务失败统一返回 `{code, message, latestVersionId?}`，其中 `code` 取自 `app/shared/errors.py`。业务模块通过 `app.modules.auth.deps.get_current_user` 鉴权：请求携带 HttpOnly `resumate_session` Cookie，服务端用其 SHA-256 查 Redis；登出、改密码或封号删除 Redis key 后，下一次请求立即返回 401。

## 测试与迁移

```bash
uv run pytest
uv run alembic upgrade head
```

测试连接 `TEST_DATABASE_URL`（默认 `resumate_test`），会重建 schema、写入内置模板，并在每个测试后回滚；会话测试用 `fakeredis` 覆盖 `get_redis`，不依赖真实 Redis。创建业务模型时继承 `app.core.db.Base`，在 `migrations/env.py` 显式导入模型模块，再运行 `uv run alembic revision --autogenerate -m '描述变更'`；审核生成的迁移后执行升级。
