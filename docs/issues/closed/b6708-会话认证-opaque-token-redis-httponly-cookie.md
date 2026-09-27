---
id: b6708
status: closed
created_at: 2026-09-27T02:50:31.137Z
updated_at: 2026-09-27T02:53:36.781Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-27T02:53:30.592Z
closed_at: 2026-09-27T02:53:36.781Z
---

# 会话认证：Opaque Token + Redis + HttpOnly Cookie

## Background

后端 `get_current_user` 仍是固定返回本地用户的占位，没有账号、密码校验或会话撤销机制；任何请求都按同一身份处理，无法登出、改密码或封号。本期建立服务端可撤销的会话认证。

## Scope

- `users` 表与密码哈希；注册、登录、登出、当前用户、改密码、管理员封号端点。
- Opaque Token：服务端随机生成、Redis 存储、可即时删除；由 HttpOnly Cookie 承载，不落前端可读存储。
- Redis 作为会话真源：每个请求校验会话 key，删除 key 即立即失效。
- `get_current_user` 改为真实会话校验；新增管理员依赖。
- 撤销路径：登出删当前会话、改密码删该用户全部会话、封号删该用户全部会话。

## Non-goals

- 不实现 OAuth/SSO、邮箱验证、找回密码、Remember Me、会话滑动续期。
- 不实现前端登录页与 UI 对接。
- 不实现解封、封禁通知、会话列表与设备管理。
- 不改现有业务端点的资源语义，仅接入鉴权。

## Acceptance Criteria

- [x] 注册、登录、登出、当前用户、改密码、管理员封号端点可用。
- [x] token 为服务端随机 opaque 值，经 HttpOnly Cookie 下发，Redis 中可查可删。
- [x] 登出、改密码、封号后对应 Redis key 立即删除，后续请求返回 401。
- [x] 封号仅管理员可对他人执行。
- [x] 子工单 d8aab、d9228 全部完成并关闭。
- [x] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

- 子工单：d8aab（认证基础设施与登录会话）、d9228（改密码与封号即时撤销会话），均已单提交关闭。
- 基础设施：`app/core/redis.py` 提供 Redis 客户端与 `get_redis`；`app/core/config.py` 增加 Redis/会话/Cookie/bootstrap 配置。
- 账号与会话：`app/modules/auth/` 的 `users` 模型、argon2 `security.py`、Redis `session_store.py`（key 为 token 的 SHA-256，用户维度集合索引）、service 与 api。
- 端点：`POST /auth/register`、`POST /auth/login`、`POST /auth/logout`、`POST /auth/password`、`GET /auth/me`、`POST /auth/users/{user_id}/ban`。
- 鉴权：`auth.deps.get_current_user` 读 Cookie → 校验 Redis → 加载用户并拒绝封禁账号；resume/jd/profile 从 auth.deps 导入，core 不反向依赖 modules。
- 撤销：登出删当前 key；改密码与封号用 `revoke_all_sessions` 删除该用户全部 key，下一次请求即 401。
- 错误契约：新增 `UNAUTHENTICATED`、`INVALID_CREDENTIALS`、`ACCOUNT_BANNED`、`FORBIDDEN`、`EMAIL_ALREADY_REGISTERED`。
- 文档：`docs/design.md` 与 `backend/README.md` 已同步架构、配置与撤销语义。

## Verification

- `uv run pytest -q`：49 passed（原 35 业务测试在覆盖 `get_current_user` 后保持通过，新增 14 项认证测试）。
- 迁移与种子：`uv run alembic upgrade head` 退出码 0，`users` 表创建；`uv run python -m app.tasks.seed` 创建 `user_admin / admin@resumate.dev`。
- 真实 Redis + 真实服务冒烟：注册 → 会话 key 1；登出 204 → key 0、`/auth/me` 401；改密码 204 → 旧会话 401、旧密码 401、新密码 200；管理员封号 → 目标 `auth:user_sessions` 由 1 变 0、目标 `/auth/me` 401、重新登录 403 `ACCOUNT_BANNED`。
- 冒烟数据已清理，运行库仅保留 seed 管理员，Redis `auth:*` 为空。
- `archkit inspect .`：Quality gates passed。
- 遗留（Non-goals）：前端登录页与 UI 对接、解封、找回密码、会话列表与滑动续期。

## Related ADRs

- None.
