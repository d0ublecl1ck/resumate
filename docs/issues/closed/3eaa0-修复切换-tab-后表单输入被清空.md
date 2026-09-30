---
id: 3eaa0
status: closed
created_at: 2026-09-30T14:25:43.841Z
updated_at: 2026-09-30T14:31:00.921Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-30T14:25:56.400Z
closed_at: 2026-09-30T14:31:00.921Z
---

# 修复切换 tab 后表单输入被清空

## Background

设置页（SCR-010）的分区导航 `/settings`、`/settings/access`、`/settings/backup` 由 `ui/src/pages/settings-layout.tsx` 的嵌套路由 `<Outlet />` 渲染。切换到其它分区再切回时，`SettingsPage` → `SettingsForm` 被卸载重建，`ui/src/components/settings-form.tsx` 中由 `useState` 持有的本地草稿（`displayName` / `maxTokens` / `endpoint` / `apiKey` 等）随组件实例一起丢失，重新回落到查询缓存里的已保存值，表现为「填了输入框、切到另一个 tab 再回来，输入框被清空」。

同时排查并排除了「浏览器 tab 切回来触发 refetch 把整页替换」的假设：`@tanstack/react-query@5.102.8` 的 `query.ts` 中 `fetchState()` 只在 `data === undefined` 时把 `status` 置回 `pending`（`query.ts:727-731`），带缓存数据的重取只把 `fetchStatus` 置为 `fetching`；`queryObserver.ts:582` 用 `status === 'pending'` 计算 `isPending`。因此窗口聚焦触发的后台重取不会让 `isPending` 翻回 `true`，`RequireAuth` / `SettingsPage` 的提前返回不会在切浏览器 tab 时卸载页面。

## Scope

- 设置分区面板改为常驻挂载、仅切换可见性，切换 tab 不卸载已填写的表单。
- 保持 `/settings`、`/settings/access`、`/settings/backup` 直接访问与应用内导航行为一致。
- 用测试固化「应用内切 tab 后再回来输入值仍在」与「窗口聚焦 refetch 不把表单替换为 PageLoading」两条行为。

## Non-goals

- 不引入 Zustand 或任何新的状态库。
- 不改后端接口、查询键与设置表单字段的提交逻辑。
- 不重构设置分区导航的无障碍语义。

## Acceptance Criteria

- [x] 先新增失败测试：在 `/settings` 填写输入框后切到「开放接入与审计」再切回 `/settings`，输入值仍在；实现前该测试为红。
- [x] 窗口聚焦触发的 refetch 不会把已填写的表单替换为 PageLoading（回归护栏）。
- [x] `pnpm -C ui test` 全绿，现有 163 条前端测试不退化。
- [x] `archkit inspect .` 通过。

## Implementation

- `ui/src/App.tsx`：设置分区收敛为单条 `settings/*` 路由，删除三段子路由；「路径 → 面板」映射只保留在布局内，避免跨文件重复声明路由。
- `ui/src/pages/settings-layout.tsx`：改为常驻 tab 面板。按 `useParams()["*"]` 决定可见分区，已访问过的面板保留实例并用 `hidden` 属性隐藏（对照 `ui/prototypes/index.html` 的 `.tabpanel[hidden]`），切换 tab 不再卸载 `SettingsForm`；未知分区仍渲染 `NotFoundPage`。
- `ui/src/pages/settings.stories.tsx`：Storybook 跟随新的 `settings/*` 路由结构，三态共享同一 wrapper。

## Verification

- 红：`pnpm -C ui test src/pages/settings-layout.test.tsx` → `Tests 1 failed | 1 passed`，断言 `应用内切到另一个分区再切回时保留正在编辑的输入` 失败（切回后 displayName 回到服务端值）。
- 绿：同命令 → `Tests 2 passed`。
- `pnpm -C ui test` → `Test Files 21 passed (21)` / `Tests 165 passed (165)`（原 163 条不退化）。
- `pnpm -C ui build` → `tsc -b` 与 `vite build` 通过。
- `archkit inspect .` → `Quality gates passed.`
- 浏览器 tab 聚焦路径已用 `focusManager.setFocused` 固化为回归护栏用例（切焦点不出现 `加载中`、输入保留）。

## Related ADRs

- None.
