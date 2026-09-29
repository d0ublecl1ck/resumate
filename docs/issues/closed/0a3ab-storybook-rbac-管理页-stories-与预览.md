---
id: 0a3ab
status: closed
created_at: 2026-09-27T13:00:00.000Z
updated_at: 2026-09-27T04:13:23.607Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-27T04:11:44.096Z
closed_at: 2026-09-27T04:13:23.607Z
---

# Storybook：RBAC 管理页 stories 与预览

## Background

`ui` 已配置 Storybook 10（`ui/.storybook/main.ts` + `preview.ts`，零 addon），但只有 `login-form.stories.tsx` 一个 story；`preview.ts` 没有初始化 i18n，也没有 QueryClient，导致依赖 `useTranslation` / React Query 的页面无法在 Storybook 里正确预览。本期补齐 RBAC 管理页的 stories 并本地跑起来预览。

## Scope

- `preview.ts` 引入 `@/i18n` 并注入默认 `QueryClientProvider`（`retry: false`、`staleTime: Infinity`），让登录与 RBAC story 都能正常取到文案与数据。
- 新增 `ui/src/pages/rbac.stories.tsx`：`Default`（三个系统角色 + 目录权限）与 `WithCustomEntries`（额外自定义角色/权限），用 `setQueryData` 预置查询数据，不依赖网络。
- Storybook 演示数据属于非界面文案，用 `i18n-allow` 注释豁免 `ui-i18n` 门禁。
- 本地启动 Storybook dev server 提供预览地址。

## Non-goals

- 不引入 Storybook addons（保持零 addon，用 React 装饰器满足需求）。
- 不做全站组件 stories 覆盖（只补 RBAC 页，沿用既有 login story）。
- 不接 MSW browser worker；story 用预置 query 数据。

## Acceptance Criteria

- [x] `preview.ts` 初始化 i18n 并注入 QueryClient；login 与 RBAC story 文案正常显示。
- [x] RBAC 页有 `Default` 与 `WithCustomEntries` 两个 story，系统项按钮禁用、自定义项可编辑。
- [x] `pnpm -C ui run build-storybook` 成功；`storybook dev` 可启动并给出可访问 URL。
- [x] 前端 test/build/lint 与 `archkit inspect .` 通过。

## Implementation

- `ui/.storybook/preview.ts` 引入 `@/i18n` 并注入默认 `QueryClientProvider`（`retry: false`、`staleTime: Infinity`），让依赖 i18n 与 React Query 的页面可在 Storybook 渲染。
- 新增 `ui/src/pages/rbac.stories.tsx`：`Default`（3 个系统角色 + 目录权限）与 `WithCustomEntries`（额外自定义角色/权限）；用 `setQueryData` 预置查询数据，story 不发网络请求。
- 演示数据用 `i18n-allow` 注释豁免 `ui-i18n` 门禁（属于数据而非界面文案）；story 用带内边距的容器包裹页面。
- `ui/.gitignore` 忽略 `storybook-static/` 构建产物。

## Verification

- `pnpm -C ui run build-storybook` → Storybook build completed successfully。
- `storybook dev` 在 **http://localhost:6010/** 启动，`index.json` 含 `pages-rbac--default`、`pages-rbac--with-custom-entries` 与 5 个 `pages-login--*`。
- 前端 `pnpm -C ui test` → 11 文件 51 passed；`build` 成功；`lint` 0 warnings / 0 errors。
- `archkit inspect .` → Quality gates passed。
- 说明：默认端口 6006 被本机另一个项目的 Storybook 占用，故本实例使用 6010；未影响对方进程。

## Related ADRs

- None.
