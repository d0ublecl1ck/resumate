---
id: eba1d
status: closed
created_at: 2026-09-27T12:20:00.000Z
updated_at: 2026-09-27T03:54:55.080Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-27T03:50:39.719Z
closed_at: 2026-09-27T03:54:55.080Z
---

# RBAC 三表：用户-角色-权限与接口级权限校验

## Background

认证并入后只有 `users.role` 单列（user/admin），既没有角色表也没有权限表，接口大多只要求「已登录」。本期落地经典 RBAC：`users` / `roles` / `permissions` 三表 + `user_roles` / `role_permissions` 关联表，每个接口显式声明所需权限码。

## Scope

- 表：`roles`(code,name,rank,is_system)、`permissions`(code,group,name)、`user_roles`、`role_permissions`；`users.role` 数据迁入 `user_roles` 后删除该列。
- 权限目录（resource:action）：resume/jd/profile/settings/access/backup 的 `read|write`，`account:read|write`，`user:read|ban|unban`，`role:read|assign`。
- 内置角色：普通用户 `user`、管理员 `admin`、超级管理员 `super_admin`（is_system，不可删）；`role_permissions` 按经典层级授权（admin ⊇ user，super_admin ⊇ admin）。
- `auth/deps.py` 提供 `require_permission(code)`（打 `__required_permission__` 标记）；`get_current_user` 将 roles 与 permissions 载入 `CurrentUser`。
- 全部后端端点显式声明权限码；public 白名单：health、register/login/logout、templates 只读、well-known、OpenAPI/docs。
- 守卫测试遍历 `app.routes`：非 public 路由必须且只能解析出一个权限码，且该码存在于权限目录。
- 管理端点：`GET /auth/users`(user:read)、ban(user:ban)、unban(user:unban)、`GET /auth/roles`(role:read)、`POST /auth/users/{id}/role`(role:assign)；封禁与改角色受层级约束（不能操作同级或更高、不能移除最后一个 super_admin、不能改自己）。
- 注册默认授予 `user` 角色；seed 幂等写入角色/权限/关联并把引导账号设为 super_admin。
- 前端：AuthUser 返回 roles/permissions；导航按权限显示管理入口，角色标签走 i18n。
- 文档：`docs/design.md`、`ui/README.md`。

## Non-goals

- 不做角色/权限的在线增删改界面（本期只提供只读列表接口与 seed 目录）。
- 不做字段级权限与行级数据权限（资源归属仍按 owner_id）。
- 不改 PAT scope 体系。
- 不做多租户。

## Acceptance Criteria

- [x] 三表 + 两张关联表落地并有迁移；`users.role` 数据已迁入 `user_roles`。
- [x] user 访问 `user:read` 端点 403；admin 可读用户列表但不能改角色；super_admin 可改角色。
- [x] 每个非 public 路由都解析出唯一权限码，守卫测试无遗漏；声明不存在的权限码会失败。
- [x] 注册用户默认 `user` 角色；引导账号为 super_admin；层级约束（同级不可操作、最后一个 super_admin 不可移除、不可改自己）生效。
- [x] 前端按权限显示管理入口与角色标签，i18n zh/en 键一致。
- [x] 后端 pytest、前端 test/build/lint、`archkit inspect .` 全部通过。

## Implementation

- 三表 + 两关联表：`roles`、`permissions`、`user_roles`、`role_permissions`；迁移 `e2f7a4c8b1d3` 同时合并两个历史 head（`266319458ead` 与 `d4b8e2a6f1c9`），建表后把 `users.role` 迁入 `user_roles` 并删除该列。
- 权限目录 `app/modules/auth/rbac.py`：19 个权限码（account/resume/jd/profile/settings/access/backup 的 read|write、user:read|ban|unban、role:read|assign）+ 3 个内置角色，通过权限集合表达继承：user 14、admin 17、super_admin 19。
- `auth/deps.py`：`require_permission(code)` 工厂在导入期校验权限码存在、打 `__required_permission__` 标记；`get_current_user` 每次请求从 `user_roles`/`role_permissions` 投影出 `roles` 与 `permissions` 写入 `CurrentUser`（无角色时 fail closed）。
- 全部端点显式声明权限：resume 11、jd 7、profile 7、settings 7、access 4、backup 4 以及 auth 的 me/password/users/ban/unban/roles/permissions/role；public 白名单为 health、register/login/logout、templates 只读、well-known、docs。
- service 侧层级约束：封禁/解封要求 actor 角色 rank 严格高于 target（admin 不能动 admin/super_admin）；改角色仅 super_admin，且不能改自己、不能移除最后一个 super_admin。
- seed：`seed_rbac` 幂等写入角色/权限/关联，`seed_admin` 创建引导账号或把已存在的引导账号提升为 super_admin。
- 守卫测试 `tests/test_access_control.py`：遍历 `app.routes` 断言非 public 路由恰好解析出一个权限码、该码在目录内、public 路由无权限依赖；并覆盖越权/层级/自改/最后超级管理员等场景。
- 前端：`AuthUser` 增加 `roles`/`permissions`，`UserRole` 增加 `super_admin`；导航按 `user:read` 权限显示管理员分区，角色标签走 i18n（新增 `nav.role.superAdmin`）；MSW 会话夹具同步。
- 文档：`docs/design.md`（表、目录、决策、端点）与 `ui/README.md`（角色与权限章节）。

## Verification

- 后端 `uv run pytest -q` → **84 passed**（新增 `test_access_control.py` 守卫与 RBAC 场景 10 项）。
- 前端 `pnpm -C ui test` → **10 文件 48 passed**；`build` 成功；`lint` 0 warnings / 0 errors。
- `archkit inspect .` → Quality gates passed（generic + `ui-i18n`）。
- 迁移与 seed（开发库 `resumate`，Redis 在跑）：`alembic upgrade head` 后 head 收敛为单个 `e2f7a4c8b1d3`；`users` 不再有 `role` 列；`roles=3`、`permissions=19`、`role_permissions=50`、`user_roles` 中引导账号为 `super_admin`。
- 真实 HTTP（uvicorn 127.0.0.1:8001）：bootstrap 登录后 `/auth/me` 返回 `role=super_admin` 与 19 个权限；`/auth/roles` 返回 (super_admin 19, admin 17, user 14)；普通用户 `/auth/users` 403 但 `/resumes` 200；super_admin 把两个用户提升为 admin（200）；被提升的 admin `/auth/users` 200、改角色 403、封禁同级 admin 403（`不能封禁同级或更高权限的账号`）；super_admin 封禁/解封 200；修改自己角色 422（`不能修改自己的角色`）。

## Related ADRs

- None.
