# backend

## 启动

在本目录执行：

```bash
uv sync
uv run uvicorn app.main:app --reload
```

`GET /health/`：数据库探活成功返回 `200 {"status":"ok"}`，连接失败返回 `500 Internal Server Error`。文档：`/docs`；OpenAPI：`/openapi.json`。

## 配置

配置统一由 `app/core/config.py` 读取环境变量和 `.env`。`APP_NAME` 为应用标题；`DATABASE_URL` 默认 `sqlite:///./app.db`，按运行目录解析，供本地开发使用。切换数据库时配置 URL 并安装对应 SQLAlchemy 驱动。

## 架构

- `app/main.py`：显式导入和注册模块 router。
- `app/core/`：Settings、数据库引擎与请求会话、同步探活依赖、分页参数、鉴权占位。
- `app/modules/health/`：`api.py` 声明依赖并映射 `schemas.py` 响应；数据库探活由 core 执行。
- `app/modules/<domain>/`：业务域按 `api → service → dao → models` 分层，schemas 定义接口契约。
- `app/shared/`：至少两个模块复用的领域对象；core 和 shared 不反向依赖 modules。
- `app/jobs/`：长时或定时作业；`app/tasks/`：小任务入口。
- `migrations/`：Alembic 环境；`tests/`：接口验证。

`get_current_user` 是会抛出 `NotImplementedError` 的占位依赖。业务模块、后台执行器和用户认证需按具体需求实现。

## 测试与迁移

```bash
uv run pytest
uv run alembic upgrade head
```

测试使用隔离的 SQLite 数据库。创建业务模型时继承 `app.core.db.Base`，在 `migrations/env.py` 显式导入模型模块，再运行 `uv run alembic revision --autogenerate -m '描述变更'`；审核生成的迁移后执行升级。
