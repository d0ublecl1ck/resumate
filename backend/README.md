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

会话相关配置：`SESSION_TTL_SECONDS`（默认 7 天）、`SESSION_COOKIE_NAME`、`SESSION_COOKIE_SECURE`（生产 HTTPS 必须为 `true`）、`SESSION_COOKIE_SAMESITE`。bootstrap 管理员由 `BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD / BOOTSTRAP_ADMIN_NAME` 控制，仅在账号不存在时创建，并直接置为已验证。

邮箱验证配置：`EMAIL_VERIFICATION_TOKEN_TTL_SECONDS`（默认 30 分钟）、`EMAIL_VERIFICATION_LOOKUP_TTL_SECONDS`（默认 7 天，token 过期或已消费后仍可用它申请重发）、`EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS`（默认 60 秒）、`EMAIL_VERIFICATION_MAX_SENDS_PER_HOUR`（默认 5 次），以及 SMTP 通道 `SMTP_HOST / SMTP_PORT / SMTP_USERNAME / SMTP_PASSWORD / SMTP_FROM_EMAIL / SMTP_STARTTLS` 与拼链接用的 `PUBLIC_WEB_BASE_URL`；`SMTP_HOST` 为空时禁用真实发信，凭据只放未跟踪的 `backend/.env`。

## 架构

- `app/main.py`：显式导入和注册模块 router，并注册统一异常处理器。
- `app/core/`：Settings、数据库引擎与请求会话、Redis 客户端、同步探活依赖、分页参数与 `CurrentUser` 类型。
- `app/modules/<domain>/`：业务域按 `api → service → dao → models` 分层，schemas 定义接口契约。
- `app/modules/auth/`：账号与 Opaque Token 会话；`session_store.py` 封装 Redis session key 与撤销，`verification_store.py` 封装邮箱验证令牌（只存 SHA-256、一次性、带 TTL）+ 更长寿命的 lookup 记录（供失效链接免输邮箱重发）、重发冷却与发送配额，`mailer.py` 用 SMTP 发验证邮件且可被依赖覆盖，`security.py` 负责 argon2 哈希，`deps.py` 提供 `get_current_user` / `require_admin`。端点：`POST /auth/register`（202，不发会话）、`POST /auth/verification/resend|verify`、`POST /auth/login|logout|password`、`GET /auth/me`、`POST /auth/users/{user_id}/ban`（仅管理员；改密码与封号会删除该用户全部会话 key）。
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

## SSE 轮次事件订阅

`GET /turns/{turn_id}/events`（权限 `resume:read`）按 Server-Sent Events 推送某个轮次的状态：
首帧 `snapshot`（与 `GET /turns/{turn_id}` 同构），轮次或待办真实变化时推 `turn.updated`，
空闲时发注释心跳 `: heartbeat`。响应头含 `Cache-Control: no-cache` 与 `X-Accel-Buffering: no`。
生成器在客户端断开时结束，请求会话由 `get_db` 关闭（事务回滚、连接归还连接池）。
实现见 `app/modules/agent/events.py`；完整契约见 `docs/agent/agent-operation-api.md` 第 18 节。

轮询与心跳间隔由 `SSE_POLL_INTERVAL_SECONDS`（默认 1）与 `SSE_HEARTBEAT_INTERVAL_SECONDS`（默认 15）控制。

本机验证「分块即时」而不是一次性响应：

```bash
# 后端（短心跳便于观察）
DATABASE_URL=postgresql+psycopg://localhost:5432/resumate \
SSE_POLL_INTERVAL_SECONDS=0.2 SSE_HEARTBEAT_INTERVAL_SECONDS=2 \
uv run uvicorn app.main:app --port 8011

# 直连：逐行打印相对到达时间
curl -sS -N --no-buffer -b cookies.txt "http://127.0.0.1:8011/turns/$TURN_ID/events" \
  | python3 -u -c 'import sys,time; t=time.time()
for line in sys.stdin: print(f"{time.time()-t:7.3f}s {line.rstrip()}")'
```

经 Vite dev proxy 时把 URL 换成 `http://127.0.0.1:5174/api/turns/$TURN_ID/events`（`/api` 由 `ui/vite.config.ts` 代理并剥前缀）。
实测两条链路都分块即时到达；http-proxy 默认流式，无需额外配置。
