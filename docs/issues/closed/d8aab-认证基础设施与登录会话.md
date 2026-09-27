---
id: d8aab
status: closed
created_at: 2026-09-27T02:50:31.520Z
updated_at: 2026-09-27T02:52:27.913Z
priority: high
labels: []
parent: b6708
blocked_by: []
design_section: 架构
started_at: 2026-09-27T02:50:48.663Z
closed_at: 2026-09-27T02:52:27.913Z
---

# 认证基础设施与登录会话

## Background

`app/core/deps.get_current_user` 固定返回 `user_local`，没有账号与密码校验，业务端点无法区分用户。先建立账号、密码哈希、Redis 会话与登录/登出闭环。

## Scope

- `app/core/config.py` 增加 `REDIS_URL`、会话 TTL、Cookie 名称/Secure/SameSite。
- `app/core/redis.py` 提供 Redis 客户端与 `get_redis` 依赖。
- `app/modules/auth/`：`users` 模型与迁移、argon2 密码哈希、`session_store`（issue/get/revoke/revoke_all）、service 与 api。
- 端点：`POST /auth/register`（注册即登录）、`POST /auth/login`、`POST /auth/logout`、`GET /auth/me`；HttpOnly Cookie 下发与清除。
- `app/modules/auth/deps.py` 提供 `get_current_user` 与 `require_admin`；resume/jd/profile 从 auth.deps 导入。
- `app/tasks/seed.py` 幂等写入种子管理员。
- 测试用 fakeredis 覆盖 `get_redis`，不依赖真实 Redis。

## Non-goals

- 改密码与封号（子工单 d9228）。
- 找回密码、邮箱验证、登录限流、OAuth。

## Acceptance Criteria

- [x] `users` 表可由 Alembic 创建；注册成功即建立会话并下发 HttpOnly Cookie。
- [x] 登录成功下发 Cookie；密码错误返回 401 `INVALID_CREDENTIALS`。
- [x] `GET /auth/me` 返回当前用户；缺少或失效 Cookie 返回 401 `UNAUTHENTICATED`。
- [x] 登出删除 Redis 会话 key 并清 Cookie，随后 `GET /auth/me` 返回 401。
- [x] 业务端点经 `auth.deps.get_current_user` 鉴权，匿名请求返回 401。
- [x] 种子管理员幂等；测试使用 fakeredis 且不污染真实 Redis。
- [x] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

- 配置与基础设施：`app/core/config.py` 增加 Redis/会话/Cookie/bootstrap 配置；新增 `app/core/redis.py`（`get_redis`）。
- 账号模型：`app/modules/auth/models.py` 定义 `users`（email 唯一、argon2 `password_hash`、role、is_banned、banned_at/reason）；迁移 `266319458ead_create_users_table.py`。
- 会话存储：`app/modules/auth/session_store.py` 用 `secrets.token_urlsafe(32)` 生成 token，Redis 只存 SHA-256（`auth:session:<sha256>`）与用户索引（`auth:user_sessions:<user_id>`）；`issue/get/revoke/revoke_all` 四个操作。
- 密码：`app/modules/auth/security.py` 用 argon2-cffi 哈希与校验。
- 端点：`app/modules/auth/api.py` 提供 register/login/logout/me；Cookie 为 HttpOnly、SameSite=lax、Path=/、TTL 7 天。
- 鉴权依赖：`app/modules/auth/deps.py` 的 `get_current_user`（Cookie → Redis → 用户，封禁即拒绝并清会话）与 `require_admin`；resume/jd/profile 改从 auth.deps 导入；core/deps.py 只保留 `CurrentUser` 与分页。
- 错误码：新增 `UNAUTHENTICATED`、`INVALID_CREDENTIALS`、`ACCOUNT_BANNED`、`FORBIDDEN`、`EMAIL_ALREADY_REGISTERED` 及对应领域异常。
- 种子：`app/tasks/seed.py` 幂等创建 `user_admin`（邮箱/密码/名称来自 Settings）。
- 测试：`conftest.py` 新增 fakeredis 与 `session_clients` 工厂（无 current-user 覆盖，走真实 Cookie/Redis 流程）；`client` 覆盖 `get_current_user` 供业务模块测试；新增 `tests/test_auth.py`。

## Verification

- `uv run pytest -q`：44 passed（新增 auth 8 项；原业务模块测试在覆盖 `get_current_user` 后保持通过）。
- `uv run alembic upgrade head`：退出码 0，`resumate` 库出现 `users` 表。
- `uv run python -m app.tasks.seed`：`bootstrap admin created=True`；`users` 表存在 `user_admin / admin@resumate.dev / admin`。
- 测试断言：注册下发 `HttpOnly`+`SameSite=lax` Cookie；重复邮箱 409；错误密码 401；无 Cookie 401；登出后 `auth:session:*` 为空且 `/auth/me` 401；匿名访问 `/resumes` 401；种子管理员可登录。
- `archkit inspect .`：Quality gates passed。

## Related ADRs

- None.
