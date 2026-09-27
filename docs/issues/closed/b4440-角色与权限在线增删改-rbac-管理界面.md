---
id: b4440
status: closed
created_at: 2026-09-27T12:45:00.000Z
updated_at: 2026-09-27T04:10:03.490Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-27T04:05:53.635Z
closed_at: 2026-09-27T04:10:03.490Z
---

# 角色与权限在线增删改（RBAC 管理界面）

## Background

RBAC 三表已落地，但角色与权限只有 seed 固化的目录和只读列表接口，管理员无法在线维护。本期提供角色/权限的增删改接口与 `/admin/rbac` 管理界面。

## Scope

- 权限目录新增 `role:write`、`permission:write`（super_admin 独占，共 21 个权限）；`permissions` 增加 `is_system`。
- 角色：`POST /auth/roles`、`PATCH /auth/roles/{id}`、`DELETE /auth/roles/{id}`（`role:write`）。
- 权限：`POST /auth/permissions`、`PATCH /auth/permissions/{id}`、`DELETE /auth/permissions/{id}`（`permission:write`）。
- 保护规则：系统角色/系统权限不可改不可删；角色 code 与权限 code 创建后不可变；删除仍被用户占用的角色返回 422；删除权限会清理 `role_permissions` 关联；角色权限集合写入时校验权限码存在。
- seed 保持权威：系统角色的权限集合按 `rbac.py` 精确同步（新增缺失、移除多余），系统权限标记 `is_system`；自定义角色/权限不被 seed 触碰。
- 前端：`/admin/rbac` 页面（角色表 + 权限表 + 编辑弹窗），导航与路由按权限显示；i18n zh/en。
- 测试与文档同步。

## Non-goals

- 不做一个用户多角色的分配界面（`POST /auth/users/{id}/role` 仍是单角色）。
- 不做独立的用户管理页（封禁/解封已有接口，页面后续再说）。
- 不允许在运行时给端点新增权限：端点权限码仍由代码 `require_permission` 声明，在线新建的权限码只作为自定义目录项。

## Acceptance Criteria

- [x] super_admin 可创建/编辑/删除自定义角色与自定义权限；系统角色/权限的修改与删除返回 422。
- [x] 删除仍被用户占用的角色返回 422；删除权限会移除其在 `role_permissions` 中的关联。
- [x] 角色/权限 code 创建后不可变；写入不存在的权限码返回 422。
- [x] 新增端点都声明了权限码，守卫测试通过；权限目录为 21 项。
- [x] `/admin/rbac` 可完成两类 CRUD 并刷新列表；无 `role:write` 权限的账号看不到入口。
- [x] 后端 pytest、前端 test/build/lint、`archkit inspect .` 全部通过。

## Implementation

- 权限目录新增 `role:write`、`permission:write`（共 21 项），归 super_admin；`permissions` 增加 `is_system`（迁移 `c9d4e8f1a2b6`）。
- 角色接口：`POST /auth/roles`、`PATCH /auth/roles/{id}`、`DELETE /auth/roles/{id}`（`role:write`）；权限接口：`POST /auth/permissions`、`PATCH /auth/permissions/{id}`、`DELETE /auth/permissions/{id}`（`permission:write`）。
- 保护规则：系统角色/系统权限改删返回 422；角色 code 与权限 code 创建后不可变（更新请求不接受 code）；写入不存在的权限码 422；删除仍被用户占用的角色 422；删除权限会清理 `role_permissions`。
- seed 权威化：`seed_rbac` 现在把系统角色的权限集合与 `rbac.py` **精确对齐**（补缺失、删多余），并把目录权限标记 `is_system=True`；自定义角色/权限不被 seed 触碰。
- 前端：新增 `/admin/rbac` 页面（角色表 + 权限表 + 创建/编辑弹窗，系统项按钮禁用），路由与导航按 `role:write` 显示；新增 `rbac` i18n 命名空间（zh-CN/en）。
- 测试：后端 `tests/test_rbac_admin.py`（目录 21 项、自定义角色 CRUD、系统项只读、code/重复/未知权限校验、在用角色不可删、自定义权限删除清理关联）；前端新增 `rbac.test.tsx` 与路由冒烟。
- 文档：`docs/design.md`（端点与决策）与 `ui/README.md`。

## Verification

- 后端 `uv run pytest -q` → **91 passed**（新增 `test_rbac_admin.py` 7 项，守卫测试自动覆盖新端点）。
- 前端 `pnpm -C ui test` → **11 文件 51 passed**；`build` 成功；`lint` 0 warnings / 0 errors。
- `archkit inspect .` → Quality gates passed（generic + `ui-i18n`，新增 rbac 词条 zh/en 键一致）。
- 迁移与 seed（开发库）：`permissions=21`、`role_permissions=52`（14+17+21）、super_admin 21 项、全部权限 `is_system=true`。
- 真实 HTTP（uvicorn 8001，Redis）：`/auth/roles` = (super_admin 21, admin 17, user 14)；创建自定义权限 201、创建自定义角色 201、编辑自定义角色 200；编辑系统角色 422（系统角色不可修改）、删除系统权限 422（系统权限不可删除）；删除自定义权限 204 且角色关联被清理；删除自定义角色 204；普通用户 `POST /auth/roles` 403。

## Related ADRs

- None.
