---
id: 7005a
status: in-progress
created_at: 2026-09-27T04:23:47.636Z
updated_at: 2026-09-27T04:23:56.501Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-27T04:23:56.501Z
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

- [ ] `App.tsx` 中每个路由界面都有对应 story，Storybook 索引包含全部界面条目。
- [ ] Storybook 预览由 MSW 提供数据，所有界面 story 能加载完成且不出现未处理请求报错。
- [ ] `test-server.ts` 与 browser worker 共用同一份 handlers，`pnpm -C ui test` 全部通过。
- [ ] `pnpm -C ui run build-storybook`、`build`、`lint` 均通过。
- [ ] `archkit inspect .` 通过（含 `ui-i18n` 门禁）。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
