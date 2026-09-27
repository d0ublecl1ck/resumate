---
id: 7005a
status: closed
created_at: 2026-09-27T04:23:47.636Z
updated_at: 2026-09-27T04:55:26.233Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-27T04:23:56.501Z
closed_at: 2026-09-27T04:55:26.233Z
---

# Storybook 为每个界面补齐 stories 与 MSW 预览

## Background

`ui` 已接入 Storybook 10，但只有 `login-form.stories.tsx`（登录表单）与 `rbac.stories.tsx`（RBAC 管理页）两个 story。`App.tsx` 实际有 15 个路由界面（工作台、简历库、简历编辑、版本历史、JD 库、JD 详情、Profile、设置、备份、开放接入、模板库、模板编辑、RBAC、登录、404），其中 13 个没有 story，无法在 Storybook 里按界面预览与评审。

同时，之前 0a3ab 为让 RBAC story 能渲染，采用「每个 story 预置 query 数据」的方式；界面数量扩大后该方式需要为每个页面复制查询键与数据形状，容易与真实契约漂移。仓库已具备 MSW（`msw`、`public/mockServiceWorker.js`、`package.json#msw.workerDirectory`）与完整的 node 端 handlers（`ui/src/test-server.ts`，`App.test.tsx` 已用它冒烟全部路由），因此把 handlers 抽成 browser/node 共用的单一来源、在 Storybook 预览中启动 MSW worker，是成本更低且不易漂移的做法。

## Scope

- 把 `ui/src/test-server.ts` 中的 MSW handlers 抽取为 `ui/src/mocks/handlers.ts`，新增 `ui/src/mocks/browser.ts` 导出 browser worker；`test-server.ts` 复用同一份 handlers，保持现有测试行为不变。
- `ui/.storybook/preview.ts`：初始化时启动 MSW browser worker（`beforeAll` 等待就绪，未匹配请求 bypass），注入稳定的 `QueryClientProvider`，保留全屏布局。
- 为 `App.tsx` 中每个有独立路由的界面新增 story：工作台、简历库、简历编辑、版本历史、JD 库、JD 详情、Profile、设置（含分区导航）、备份与迁移、开放接入与审计、模板库、模板编辑、404；登录与 RBAC 沿用已有 story。
- 每个 story 渲染真实页面组件（含 `AppShell` 外壳，登录页除外），数据由 MSW 按后端契约返回，不在 story 内复制业务数据。
- 新增的 story 文件不硬编码中文界面文案（标题、story 名用英文），通过 `ui-i18n` 门禁。

## Non-goals

- 不引入 Storybook addons（保持零 addon；MSW 由 `preview.ts` 直接启动）。
- 不新增或修改业务页面、组件与后端接口。
- 不追求组件级（kit 原子组件）stories 全覆盖，只覆盖路由级界面。

## Acceptance Criteria

- [x] `App.tsx` 中每个路由界面都有对应 story，Storybook 索引包含全部界面条目。
- [x] Storybook 预览由 MSW 提供数据，所有界面 story 能加载完成且不出现未处理请求报错。
- [x] `test-server.ts` 与 browser worker 共用同一份 handlers，`pnpm -C ui test` 全部通过。
- [x] `pnpm -C ui run build-storybook`、`build`、`lint` 均通过。
- [x] `archkit inspect .` 通过（含 `ui-i18n` 门禁）。

## Implementation

- `ui/src/mocks/handlers.ts`：从 `ui/src/test-server.ts` 抽出全部 MSW handlers（fixtures 仍引用 `lib/content.ts`）；`test-server.ts` 改为仅 `setupServer(...handlers)`，新增 `ui/src/mocks/browser.ts` 导出 `setupWorker(...handlers)`，Vitest 与 Storybook 共用同一份端点契约。
- `ui/.storybook/preview.ts`：`beforeAll` 等待 MSW browser worker 就绪（`onUnhandledRequest: "bypass"`、`quiet: true`），decorator 注入由 `useState` 保持稳定的 `QueryClientProvider`，保留全屏布局。
- `ui/src/storybook/screen.tsx`：`StoryProviders`（每个 story 独立 QueryClient，可预置查询）；`Screen`（MemoryRouter + `AppShell` 外壳）。story 只声明路由与页面组件，不复制业务数据。
- 新增 13 个路由界面的 story：Workbench、Resumes（Default/Empty）、ResumeEditor（WithActiveRun/WithoutActiveRun）、ResumeVersions、Jds（Default/Empty）、JdDetail（Bound/BindingUnavailable）、Profile、Settings（Default/Backup/Access，含分区导航与子路由）、Templates、TemplateEditor（ValidationFailed/ReadyToPublish）、NotFound；登录（`login-form.stories.tsx`）与 RBAC（`rbac.stories.tsx`）沿用既有 story。
- story 的 title/story 名使用英文，未硬编码中文界面文案；界面数据由 MSW 按后端契约返回，避免与真实契约漂移。

## Verification

- `pnpm -C ui test` → 11 个测试文件、53 tests passed（handlers 抽取后用例行为不变）。
- `pnpm -C ui run lint` → 0 warnings / 0 errors。
- `pnpm -C ui run build` → `tsc -b` + `vite build` 成功（story 文件参与类型检查）。
- `pnpm -C ui run build-storybook` → Storybook build completed successfully；`index.json` 含 25 条 story；`mockServiceWorker.js` 进入构建产物（RBAC 左树右表改动合入后复验）。
- 浏览器实测（headless Chrome + CDP 打开 `iframe.html?id=<story>`）：25/25 story 渲染成功（`body.sb-show-main`、`#storybook-root` 有内容、无 `sb-show-errordisplay`、无 console exception、无 HTTP 4xx）；workbench story 文本含未提交草稿 / 待确认修改 / 高级前端工程师简历 / 美团，并检测到 1 个已注册 service worker，证明 MSW 在预览中真实生效。
- `archkit inspect .` → Quality gates passed。

## Related ADRs

- None.
