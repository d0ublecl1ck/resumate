---
id: b3533
status: in-progress
created_at: 2026-10-08T15:32:00.000Z
updated_at: 2026-10-09T03:27:21.325Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T03:27:21.325Z
---

# 对话入口与历史对话列表：新建对话与列表项 Storybook 先行

## Background

`ui/src/components/session-history.tsx` 已有 `SessionList` / `SessionDetail`（纯展示、Storybook 用），但只有「时间 + id 尾巴」这种兜底标题，也没有任何「新建对话」入口。用户要求把「新建对话」与「历史对话列表」的 Storybook 补上，作为确认视觉与交互的工件。

后端 `GET /sessions` 目前只有 `id / createdAt / lastActiveAt`，**没有 title / summary / messageCount 字段**；本工单只做展示层入参与 story，不改后端契约，也不新增 `lib/api.ts` 调用。

## Scope

- 新增「新建对话」入口的展示组件与状态：默认、提交中（禁用）、以及「刚创建还未发消息」的空会话态。
- 历史对话列表项重做：标题优先用传入的派生标题，缺失时退化成「未命名对话」+ 时间；第二行显示相对时间与消息数（字段缺失时不显示）。
- 列表整体状态：默认、选中态、很多条（可滚动）、超长标题、没有可派生标题、空、加载、错误；列表顶部固定「新建对话」入口。
- 原型 `ui/prototypes/index.html` 先登记这些状态（复用既有令牌与类，不新增视觉规则）。
- Storybook story 覆盖上述全部状态，注入数据驱动，不接真实后端。

## Non-goals

- 不改后端契约（不新增 session title / summary 字段），也不改 `ui/src/lib/api.ts` 与 `ui/src/lib/types.ts`。
- 不把列表接进路由或真实页面；本期只到 Storybook 确认。
- 不实现「重命名会话」「删除会话」。

## Acceptance Criteria

- [ ] 原型新增 `#screen-session-history` 章节，登记新建入口、派生标题、时间兜底、长列表、空 / 加载 / 错误等状态。
- [ ] `session-history.tsx` 的列表项支持可选 `title` / `messageCount`，缺失时有明确兜底，不渲染 undefined。
- [ ] 新增「新建对话」入口组件，含默认 / 禁用态与 `onCreate` 回调。
- [ ] Storybook 覆盖：新建入口（默认 / 禁用）、带派生标题的列表、无标题兜底、选中态、超长标题、20 条长列表、空 / 加载 / 错误，以及「新建入口 + 列表 + 详情」组合页。
- [ ] `pnpm -C ui test`、`pnpm -C ui build-storybook`、`archkit inspect .` 全部通过。
- [ ] 用户在 Storybook 确认视觉与交互（关单前置）。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
