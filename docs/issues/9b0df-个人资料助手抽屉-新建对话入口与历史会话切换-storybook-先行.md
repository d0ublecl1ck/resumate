---
id: 9b0df
status: in-progress
created_at: 2026-10-09T16:12:37.881Z
updated_at: 2026-10-09T16:12:47.171Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:12:47.171Z
---

# 个人资料助手抽屉：新建对话入口与历史会话切换 Storybook 先行

## Background

`/profile` 右侧「个人资料助手」抽屉（`ui/src/components/profile-assistant.tsx`，由 `profile-workspace.tsx` 打开）目前只有一个入口语义：进去就是当前对话，没有「新建对话」，也没有历史会话列表，用户无法切回旧 session 继续聊。

可复用的展示零件已经在 `ui/src/components/session-history.tsx` 里（`SessionList` / `SessionDetail` / `NewConversationEntry` / `shortSessionId` / `sessionLabel`），其中 `NewConversationEntry` 至今零接线，只在 story 与 test 里用过。同类先例 `resume-chat-panel.tsx` 已经做了「当前对话 / 历史会话」两个 tab、列表点击切详情、继续对话，本轮只借鉴它的信息结构与交互顺序，不照抄接线。

会话作用域结论已冻结：`agent_sessions` 只绑 owner，`scope` 是轮次属性；继续对话 = 先 `POST /sessions/{id}/messages` 再带同一 `sessionId` 起 run（契约 §19.1 / §21.1）。本轮不碰这条链路。

按 `new-react-page` 强顺序与 `AGENTS.md` 的页面开发规则，本轮只补原型与 Storybook 展示层，交给用户确认视觉与交互，确认前不接后端。

## Scope

- `ui/prototypes/index.html` 的 `#screen-profile` 助手抽屉补登记：新建对话入口（可用 / 运行中禁用）、当前对话 / 历史会话切换、历史列表（默认 / 空 / 加载 / 错误）、选中详情（含压缩历史）、底部继续输入框、当前对话里的失效待办。
- 新增纯 props 展示组件 `ui/src/components/profile-assistant-panel.tsx`，复用 `session-history.tsx` 的零件，不发任何请求。
- 新增 `ui/src/components/profile-assistant-panel.stories.tsx` 覆盖全部状态，并按仓库惯例补 story 渲染测试。
- 新增文案走 i18n，`zh-CN` 与 `en` 同步补齐。

## Non-goals

- 不改 `ui/src/components/profile-assistant.tsx` 的接线行为，不新增 / 修改任何 API 调用，不改 `profile-workspace.tsx` 的状态机。
- 不改 `ui/src/components/session-history.tsx`（只复用）。
- 不实现真实的新建会话 / 切换会话 / 继续对话请求；回调只做声明。
- 不改后端、`compose.yaml`、`docs/competition/**`。

## Acceptance Criteria

- [ ] 原型 `#screen-profile` 覆盖新建对话入口、当前 / 历史切换、历史列表默认 / 空 / 加载 / 错误、选中详情（含压缩历史）、底部继续输入、当前对话失效待办。
- [ ] `profile-assistant-panel.tsx` 纯 props 驱动，无任何请求调用。
- [ ] Storybook 覆盖 NewConversationFiltered / NewConversationDisabled / HistoryList / HistoryEmpty / HistoryLoading / HistoryError / HistoryDetail / HistoryCompacted / CurrentSession（含「该待办已随轮次关闭失效」）。
- [ ] i18n zh-CN 与 en 键结构一致、en 无残留中文、组件与 story 无硬编码中文。
- [ ] `pnpm -C ui exec tsc -b --noEmit`、`pnpm -C ui test`、`node quality-gates/run.js`、`archkit inspect .` 全部通过。
- [ ] 用户在 Storybook 确认视觉与交互（关单前置）。

## Implementation

- 原型 `ui/prototypes/index.html`：`#screen-profile` 新增「个人资料助手抽屉」区块 —— 新建对话入口（可用 / 运行中禁用）、「当前对话 / 历史会话」tab 两态、当前对话含失效待办、历史列表选中态 + 详情（含压缩历史）+ 底部继续输入框；`<ul class="states">` 补 5 条。令牌与类全部沿用既有规范，未新增视觉规则。
- 新增 `ui/src/components/profile-assistant-panel.tsx`：纯 props 驱动展示组件，复用 `session-history.tsx` 的 `NewConversationEntry` / `SessionList` / `SessionDetail` 与 `kit/pending-action.tsx` 的 `PendingActionCard`；不 import `@/lib/api`，不发任何请求。props 契约：`mode` / `sessions` / `messages` / `activeSessionId` / `currentRun`（含 `bubbles` / `pendingActions` / `turnClosed` / `thinking`）/ `error` / `creating` + `onCreate` / `onSelect` / `onBack` / `onContinue` / `onModeChange`。
- 新增 `ui/src/components/profile-assistant-panel.stories.tsx`：9 个 story（NewConversationFiltered / NewConversationDisabled / HistoryList / HistoryEmpty / HistoryLoading / HistoryError / HistoryDetail / HistoryCompacted / CurrentSession）。
- 新增 `ui/src/components/profile-assistant-panel.stories.test.tsx`（逐 story 渲染断言）与 `ui/src/components/profile-assistant-panel.test.tsx`（回调契约）。
- i18n：`ui/src/i18n/locales/{zh-CN,en}/profile.ts` 新增 `assistant.panel.*` 4 键（tabsLabel / historyHint / currentEmptyTitle / currentEmptyDescription），键结构一致。

## Verification

- `pnpm -C ui exec tsc -b --noEmit` → exit 0，无输出。
- `pnpm -C ui test` → 78 个测试文件 / 569 条测试全部通过（新增 2 个文件 / 15 条）。
- `node quality-gates/run.js` → `Quality gates passed.`（exit 0）。
- `archkit inspect .` → `Quality gates passed.`（exit 0）。
- 原型静态校验：jsdom 解析 `ui/prototypes/index.html` 成功，`#screen-profile` 的 `ul.states` 15 条、`[role=tablist]` 2 个，文本含「该待办已随轮次关闭失效」「正在新建对话…」「在这个会话继续对话…」。
- Storybook `pnpm -C ui exec storybook dev -p 6007 --no-open --ci --quiet` 运行中，`/index.json` 逐 story id 校验存在。

## Related ADRs

- None.
