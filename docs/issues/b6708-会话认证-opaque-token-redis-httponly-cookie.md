---
id: b6708
status: open
created_at: 2026-09-27T02:50:31.137Z
updated_at: 2026-09-27T02:50:31.137Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 架构
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

- [ ] 注册、登录、登出、当前用户、改密码、管理员封号端点可用。
- [ ] token 为服务端随机 opaque 值，经 HttpOnly Cookie 下发，Redis 中可查可删。
- [ ] 登出、改密码、封号后对应 Redis key 立即删除，后续请求返回 401。
- [ ] 封号仅管理员可对他人执行。
- [ ] 子工单 d8aab、d9228 全部完成并关闭。
- [ ] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
