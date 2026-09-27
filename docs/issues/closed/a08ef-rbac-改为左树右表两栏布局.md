---
id: a08ef
status: closed
created_at: 2026-09-27T05:00:00.000Z
updated_at: 2026-09-27T05:06:41.981Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-27T04:34:21.834Z
closed_at: 2026-09-27T05:06:41.981Z
---

# RBAC 改为左树右表两栏布局

## Background

上一版（8f581）是「角色列表 + 权限树」，角色的权限勾选在弹窗里完成。经典权限后台是左树右表：左侧角色树、右侧选中角色的详情与权限勾选，减少一次弹窗跳转，角色切换也更直观。

## Scope

- 左栏：角色树，按「系统内置 / 自定义」两个分组，点击角色在右侧加载；保留「新建角色」入口。
- 右栏：选中角色的详情（code / 名称 / 描述）+ 权限树勾选；自定义角色可改可删，系统角色只读（复选框禁用 + 只读提示）。
- `PermissionTree` 增加 `disabled` 只读态；新增 `RoleTree` 组件（复用 @headless-tree/react）。
- 首次进入默认选中第一个角色；新建保存后选中新角色，删除后回到默认。
- i18n 新增 `rbac.detail.*` 与 `rbac.tree.roleLabel`；测试与 Storybook 同步。

## Non-goals

- 不做权限的在线增删改（权限码由代码声明，目录保持只读）。
- 不做角色拖拽排序、搜索、虚拟滚动。
- 不改后端接口与 RBAC 数据模型。

## Acceptance Criteria

- [x] 左角色树按「系统内置 / 自定义」分组，点击切换右侧角色。
- [x] 右侧展示角色详情 + 权限树；自定义/新建可勾选并保存；系统角色只读并显示提示。
- [x] 默认选中首个角色；新建保存后选中新角色，删除后回到默认。
- [x] 前端 test / build / lint、build-storybook、archkit inspect 全部通过。

## Implementation

- 左栏新增 `ui/src/components/role-tree.tsx`：角色树按「系统内置 / 自定义」分组，复用 `@headless-tree/react`；点击角色经 `onPrimaryAction` 回传选中 id（`getProps().onClick` 会调 `item.primaryAction()`）。
- 右栏 `RoleDetail`：角色详情（code 只读、名称/描述可改）+ 权限树三态勾选；自定义角色可保存/删除，系统角色只读（字段禁用 + 只读提示）。
- `PermissionTree` 新增 `disabled` 只读态：仍显示复选框与勾选状态，但不可修改，用于系统角色预览其权限。
- 默认选中改为**渲染期派生**（`selection ?? roleList[0]`）而不是 effect 里 `setState`，消除 `react(set-state-in-effect)` 与 `exhaustive-deps` 两个 lint 警告。
- i18n 新增 `rbac.detail.empty` / `rbac.detail.systemReadonly` / `rbac.tree.roleLabel`（zh-CN 与 en 同结构）。
- 同步 `ui/src/mocks/handlers.ts` 的 RBAC fixtures（移除已废弃的 `permission:write`）；测试改为异步等待树构建（headless-tree 的 items 在挂载后一个 effect 才构建）。

## Verification

- 前端 `pnpm -C ui test` → **11 文件 53 passed**（含左树右表、切换角色、新建角色三个用例）；`build` 成功；`lint` 0 warnings / 0 errors；`build-storybook` 成功；`archkit inspect .` Quality gates passed。
- Storybook 重启后仍提供 `pages-rbac--default` 与 `pages-rbac--with-custom-entries`，页面已切换为两栏。
- 事故与并发说明：本仓库有**并发会话**在改动（把 MSW handlers 重构到 `ui/src/mocks/handlers.ts`、新增 issue `7005a`）。我在上一张工单提交时用了 `git add -A`，**误把该会话的在制文件（`ui/src/mocks/handlers.ts`、`ui/src/mocks/browser.ts`、`docs/issues/7005a-*.md`）扫进了 `5905f50` 提交**。本次已改为**按文件显式 `git add`**，未再触碰 `7005a` 的未提交改动。

## Related ADRs

- None.
