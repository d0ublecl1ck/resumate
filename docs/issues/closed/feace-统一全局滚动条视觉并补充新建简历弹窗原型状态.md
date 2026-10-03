---
id: feace
status: closed
created_at: 2026-10-03T06:18:53.860Z
updated_at: 2026-10-03T07:05:42.088Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-03T06:19:07.999Z
closed_at: 2026-10-03T07:05:42.088Z
---

# 统一全局滚动条视觉并补充新建简历弹窗原型状态

## Background

新建简历弹窗（`ui/src/components/create-resume-modal.tsx`）的滚动容器使用 `max-h-[88vh] overflow-auto`，但 `ui/src/index.css` 与组件内都没有任何滚动条规则，因此渲染为浏览器/Electron 原生滚动条：宽轨道 + 高对比方形滑块，与定稿原型 `ui/prototypes/index.html` 的粗描边、圆角、暖纸底视觉基线明显冲突。定稿原型当前也没有覆盖滚动条这一状态。

## Scope

- 按「页面开发」规则先补原型状态：在 `ui/prototypes/index.html` 增加可复现的全局滚动条样式定义。
- 在 `ui/src/index.css` 落地全局细滚动条：同时提供标准属性（`scrollbar-width` / `scrollbar-color`）与 WebKit 伪元素规则，明暗主题都取用现有 token。
- 新增 Storybook story 供用户确认（遵循 `new-react-page` 的 Storybook 先行顺序）。

## Non-goals

- 不改任何滚动行为、容器尺寸、布局或交互逻辑。
- 不引入新的运行时依赖或 Storybook addon。
- 不做逐组件/逐页面的滚动条变体。

## Acceptance Criteria

- [x] `ui/prototypes/index.html` 含可复现的滚动条样式定义，与既有 `:root` token 对齐。
- [x] `ui/src/index.css` 定义全局细滚动条，明暗主题均使用主题 token，无裸色值。
- [x] Storybook story 能展示滚动容器且 `pnpm -C ui build-storybook` 通过。
- [x] `pnpm -C ui test` 与 `archkit inspect .` 通过。

## Implementation

- `ui/prototypes/index.html`：`<style>` 内补全局滚动条定义（标准属性 `scrollbar-width:thin` + `scrollbar-color`；`::-webkit-scrollbar` 10px 轨道、999px 圆角、3px 内缩、悬停 48% 墨色回落），并新增「设计补充 · 滚动容器与滚动条」注册章节，复用 `--ink` / `--card` / `--radius` 既有令牌。
- `ui/src/index.css`：`@layer base` 增加同义全局规则，滑块取 `color-mix(in oklab, var(--foreground) 26%, transparent)`、悬停 48%、轨道透明；明暗主题由 `--foreground` 自动跟随，不引入裸色值。
- 口径说明：同一元素同时声明标准属性与 `::-webkit-scrollbar` 时，现代 Chromium 采用标准属性并忽略 WebKit 伪元素，因此 WebKit 规则只作旧引擎等价回落；原型文案按此实际口径描述，不把回落渲染写成主视觉。
- 新增视觉确认件 `ui/src/storybook/scrollbar.stories.tsx`（Light / Dark）。
- 新增测试 `ui/src/index.css.test.ts`（全局滚动条文本契约）。
- 弹窗确认件 `ui/src/components/create-resume-modal.stories.tsx` 与 `ui/src/components/create-resume-modal.stories.test.tsx` 同期由 b4cd1 接手改造（两条链路），本工单不再持有。

## Verification

- 先写测试并确认在改实现前失败：把 `ui/src/index.css` 回退到 HEAD 后 `pnpm exec vitest run src/index.css.test.ts` → `Tests 2 failed | 1 passed (3)`；恢复实现后 → `Tests 3 passed (3)`。
- `pnpm -C ui test` → `Test Files 33 passed (33)`，`Tests 245 passed (245)`（本工单新增 3 条，其余为同期交付的 b4cd1）。
- `pnpm -C ui build` → `✓ built`（含 `tsc -b`）。
- `pnpm -C ui build-storybook` → `Storybook build completed successfully`。
- `archkit inspect .` → `Quality gates passed.`
- 视觉确认件：Storybook 的 `Design/Scrollbar`（明/暗）。

## Related ADRs

- None.
