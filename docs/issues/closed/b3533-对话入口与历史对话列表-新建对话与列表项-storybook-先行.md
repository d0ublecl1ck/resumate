---
id: b3533
status: closed
created_at: 2026-10-08T15:32:00.000Z
updated_at: 2026-10-09T17:06:29.530Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T03:27:21.325Z
closed_at: 2026-10-09T17:06:29.530Z
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

- [x] 原型新增 `#screen-session-history` 章节，登记新建入口、派生标题、时间兜底、长列表、空 / 加载 / 错误等状态。
- [x] `session-history.tsx` 的列表项支持可选 `title` / `messageCount`，缺失时有明确兜底，不渲染 undefined。
- [x] 新增「新建对话」入口组件，含默认 / 禁用态与 `onCreate` 回调。
- [x] Storybook 覆盖：新建入口（默认 / 禁用）、带派生标题的列表、无标题兜底、选中态、超长标题、20 条长列表、空 / 加载 / 错误，以及「新建入口 + 列表 + 详情」组合页。
- [x] `pnpm -C ui test`、`pnpm -C ui build-storybook`、`archkit inspect .` 全部通过。
- [x] 用户在 Storybook 确认视觉与交互（关单前置）。

## Implementation

- `ui/src/components/session-history.tsx`：`SessionSummary` 补可选 `title` / `messageCount`，列表项第二行按存在性渲染消息数，标题缺失时兜底「未命名对话」/「未命名对话 · {{time}}」，绝不渲染 undefined；新增 `NewConversationEntry`（默认 / `disabled` 提交中切文案）。
- `ui/prototypes/index.html`：新增 `#screen-session-history` 章节，登记新建入口、派生标题、时间兜底、分组、超长标题、长列表与空 / 加载 / 错误态。
- `ui/src/components/session-history.stories.tsx`：20 个 story（NewConversationDefault / NewConversationDisabled / ListWithTitles / ListUntitledFallback / ListGroupedByTime / ListSingleSession / ListSelected / ListLongTitle / ListLong / ListNewSessionEmpty / ListDefault / ListEmpty / ListLoading / ListError / CompositePage / DetailDefault / DetailCompacted / DetailEmpty / DetailLoading / DetailError）。
- `ui/src/components/session-history.stories.test.tsx`：13 条逐 story 渲染断言。

## Verification

- `pnpm -C ui test`（本次审计复跑，HEAD f2be73a）：`Test Files 81 passed (81)` / `Tests 649 passed (649)`。
- `pnpm -C ui build-storybook`（本次审计复跑）：`Storybook build completed successfully`（exit 0）。
- `archkit inspect .`：`Quality gates passed.`（exit 0）。
- 归档核对（只读）：实现提交 `5686f0f` feat(ui): 历史会话列表相对时间、会话标题与新建会话提示；原型章节在 `ui/prototypes/index.html:862`；`SessionSummary.title?/messageCount?` 与 `NewConversationEntry` 均在 `session-history.tsx`。
- 覆盖关系：真实数据由后端 **360b1**（`GET /sessions` 返回派生 title / messageCount）与 **e5290**（历史会话列表按会话呈现）落地，并由 **bb89f**（`09ba38b`）把这套零件接进个人资料助手抽屉正文；本工单的 Storybook 先行职责闭环，无剩余项。

## Related ADRs

- None.
