# backend

## 启动

先准备 PostgreSQL：创建运行库与测试库（本机 Homebrew 为例）。

```bash
brew services start postgresql@18
createdb resumate
createdb resumate_test
```

在本目录执行：

```bash
uv sync
uv run alembic upgrade head
uv run python -m app.tasks.seed
uv run uvicorn app.main:app --reload
```

`GET /health/`：数据库探活成功返回 `200 {"status":"ok"}`，连接失败返回 `500 Internal Server Error`。文档：`/docs`；OpenAPI：`/openapi.json`。

## 配置

配置统一由 `app/core/config.py` 读取环境变量和 `.env`。`APP_NAME` 为应用标题；`DATABASE_URL` 默认 `postgresql+psycopg://localhost:5432/resumate`，使用 psycopg 3 驱动。测试通过 `TEST_DATABASE_URL` 指向隔离测试库。

## 架构

- `app/main.py`：显式导入和注册模块 router，并注册统一异常处理器。
- `app/core/`：Settings、数据库引擎与请求会话、同步探活依赖、分页参数、单用户占位依赖。
- `app/modules/<domain>/`：业务域按 `api → service → dao → models` 分层，schemas 定义接口契约。
- `app/modules/templates/`：模板只读查询，当前不含管理端写接口。
- `app/shared/`：至少两个模块复用的领域对象；`schemas.py` 提供 camelCase 线协议基类，`errors.py` 提供机器错误码、领域异常与 `ApiError` 信封。core 和 shared 不反向依赖 modules。
- `app/jobs/`：长时或定时作业；`app/tasks/seed.py`：内置参考数据幂等种子。
- `migrations/`：Alembic 环境；`tests/`：接口验证。

业务失败统一返回 `{code, message, latestVersionId?}`，其中 `code` 取自 `app/shared/errors.py`；`get_current_user` 为固定本地用户的单用户占位，接入真实认证前不得多用户部署。

## 测试与迁移

```bash
uv run pytest
uv run alembic upgrade head
```

测试连接 `TEST_DATABASE_URL`（默认 `resumate_test`），会重建 schema、写入内置模板，并在每个测试后回滚，不污染运行库。创建业务模型时继承 `app.core.db.Base`，在 `migrations/env.py` 显式导入模型模块，再运行 `uv run alembic revision --autogenerate -m '描述变更'`；审核生成的迁移后执行升级。
