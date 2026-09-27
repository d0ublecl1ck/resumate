---
id: 8f581
status: open
created_at: 2026-09-27T04:22:22.811Z
updated_at: 2026-09-27T04:22:22.811Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
---

# RBAC 权限树交互（headless-tree）

## Background

TODO

## Scope

- TODO

## Non-goals

- None.

## Acceptance Criteria

- [x] TODO

## Implementation

- 组件选型：`@headless-tree/react@1.7.0` + `@headless-tree/core@1.7.0`（headless、feature 化、无样式，适配 React 19 与项目 Tailwind；Base UI 1.8 无 Tree，项目未装 Radix）。
- 新增 `ui/src/components/permission-tree.tsx`：按 `permission.group` 分组的两级权限树，可选三态勾选（分组父节点 + 子权限），空文件夹/展开折叠/键盘可达。
- 新增 `ui/src/lib/permission-tree.ts`：节点 id 约定（`root` / `group:*` / 权限码）与 `checkedPermissionCodes(tree)`，把纯逻辑与组件分离以满足 react-refresh 的「只导出组件」约束。
- `/admin/rbac` 权限区改为只读权限树，叶子节点同时显示名称与权限码；角色编辑弹窗用同一棵可勾选树，保存时从 `tree.getState().checkedItems` 取勾选权限码。
- 权限文案按权限码映射 i18n：新增 `rbac.group.*`、`rbac.permission.*`（20 个权限码）、`rbac.tree.*`，不再直接渲染后端返回的中文名，满足「枚举文案用键映射」。
- 前端测试新增「角色弹窗用权限树勾选」；Storybook 重启以纳入新依赖。

## Verification

- API 用法不是凭记忆：读取安装包 `@headless-tree/core/dist/index.d.ts` 与 feature 实现确认 `useTree`、`TreeDataLoader`、`syncDataLoaderFeature`、`checkboxesFeature`（`getCheckboxProps()` 自带 `onChange/checked/indeterminate`）、`CheckedState`、`getState().checkedItems`。
- 前端 `pnpm -C ui test` → **11 文件 52 passed**（新增权限树用例）；`build` 成功；`lint` 0 warnings / 0 errors；`build-storybook` 成功；`archkit inspect .` Quality gates passed。
- Storybook（http://localhost:6010/）重启后 `index.json` 仍含 `pages-rbac--default` 与 `pages-rbac--with-custom-entries`，story iframe 返回 200，页面已渲染权限树。
- 依赖安装说明：本机主 workspace 的 node_modules 由 pnpm 11.24.0（store v11）安装，DSH 自带 pnpm 为 10.34.5（store v10），故用 `fnm` 的 pnpm 11.24.0 执行 `pnpm add` 以避免 store 不匹配。

## Related ADRs

- None.
