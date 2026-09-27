---
id: 8f581
status: in-progress
created_at: 2026-09-27T04:22:22.811Z
updated_at: 2026-09-27T04:27:35.044Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-27T04:27:35.044Z
---

# RBAC 权限树交互（headless-tree）

## Background

RBAC 三表与角色 CRUD 已落地，但权限目录是扁平网格、角色编辑是一长列复选框；权限码与端点绑定且目录只读，用「按资源分组的权限树 + 三态勾选」更直观，也更接近常见后台权限管理交互。Base UI 1.8 没有 Tree，项目也未装 Radix，因此选用开源 headless 组件。

## Scope

- 引入 `@headless-tree/react` + `@headless-tree/core`（headless、feature 化、无样式）。
- 新增权限树组件：按 `permission.group` 分组，分组为父节点、权限为叶子；支持展开/折叠与三态勾选；叶子同时展示名称与权限码。
- `/admin/rbac` 权限区改为只读权限树；角色编辑弹窗用同一棵可勾选树，保存时取勾选的权限码。
- 权限名称与分组文案按 code/group 映射 i18n，不再直接渲染后端中文名。
- 更新前端测试与 Storybook。

## Non-goals

- 不做权限的在线增删改（权限码由代码静态声明，目录保持只读）。
- 不引入 headless-tree 的拖拽排序、重命名、虚拟滚动、搜索等高级 feature。
- 不改后端接口与 RBAC 数据模型。

## Acceptance Criteria

- [x] 权限目录以分组树展示，可展开/折叠，叶子显示名称与权限码。
- [x] 角色弹窗用三态勾选树，父节点联动子权限，保存时提交勾选的权限码。
- [x] 权限文案走 i18n 键映射，zh-CN/en 键结构一致。
- [x] 前端 test / build / lint、build-storybook、archkit inspect 全部通过。

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
