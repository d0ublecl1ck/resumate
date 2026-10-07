---
id: 9d3cb
status: in-progress
created_at: 2026-10-07T10:13:16.179Z
updated_at: 2026-10-07T10:13:31.175Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-07T10:13:31.175Z
---

# 简历编辑页 Agent 对话运行中与轮次结束后都看不到对话

## Background

上一个工单（49879）修掉了「发完 prompt 整页白屏」后，简历编辑页 `/resumes/:id` 的中间栏仍看不到任何对话。实测采样（无头 Playwright + admin storage_state，简历 `res_aeba1b686aa4`）：

```text
t+ 2s..10s :: Agent 对话 | 运行中 | 当前 Run 模式：Approval 逐项确认（服务端固化） | 预算 0/0 tokens · 0/0 轮
t+12s..28s :: Agent 对话 | 当前 Run 模式：Approval 逐项确认（服务端固化） |  | 还没有对话。描述你的编辑意图，Agent 会生成待确认的修改。
```

两条独立的缺陷：

1. **对话内容没被映射进时间线。** `ui/src/lib/api.ts:303 mapTurnToRun` 只把 `turn.message`（用户消息）与 `turn.result?.message`（finalize 文案）塞进 `AgentRun.timeline`。真实对话在会话层：`agent-core` 的 `SessionJournal`（`agent-core/src/resumate_agent_core/session.py`）把每轮模型上下文镜像进 `agent_session_messages`（`system/user/assistant/tool`），run 结束时 `reply()` 再写一条 `role=assistant, content={text}` 的最终回复；契约见 `docs/agent/agent-operation-api.md` §19.1 与 §21.5。标准 run（`POST /resumes/{id}/runs`）由运行体先建会话再建轮次，`UserTurnResponse.sessionId` 指向该会话。`GET /turns/{id}/events` 的 SSE 只推 `snapshot` / `turn.updated` 两种**整轮投影**，不推 message / 工具事件（`backend/app/modules/agent/events.py:59`，契约 §18.3 明确「没有假事件」），因此对话必须从 `GET /sessions/{id}/messages` 读取。

2. **轮次结束后 active-run 立刻归空。** `ui/src/lib/api.ts:198 getActiveRun` 只用 `GET /resumes/{id}/turns?state=open` 发现轮次，轮次 finalize 后返回 `null`，`RunPanel` 立刻回到「还没有对话」。另外标准的 `POST /resumes/{id}/runs` 运行体建出的轮次 `message` 为空，用户 prompt 只存在于会话消息里，所以运行中连用户消息也渲染不出来。

## Scope

- 新增 `ui/src/lib/run-conversation.ts`：把 `agent_session_messages` 投影为 `RunTimelineEvent[]`（user / assistant 文本、assistant toolCalls 与 tool 结果的活动行、跳过 system/summary），并与轮次投影时间线合并去重（会话已有用户消息时不重复渲染 `turn.message`，finalize 事件始终保留）。
- `ui/src/lib/api.ts`：
  - `getActiveRun` 改为「优先 open，否则取最新一轮」（`GET /resumes/{id}/turns` 不带 state），用 `turn.sessionId` 拉取会话消息并合成 `timeline`；会话消息拉取失败时退回轮次投影，不阻塞面板。
  - 新增可选参数 `withConversation`，工作台摘要只需要待办数，传 `false` 避免逐份简历拉全量会话。
- `ui/src/components/run-panel.tsx`：轮次处于 open 时轮询 active-run（1.5s），让运行中的工具活动与回复持续出现；SSE `turn.updated` 仍触发刷新。
- 测试：`ui/src/lib/run-conversation.test.ts`（新）、`ui/src/lib/run-api.test.ts`、`ui/src/components/run-panel.test.tsx`。
- Storybook：`ui/src/mocks/handlers.ts` 给 mock 轮次会话补对话消息；`ui/src/pages/resume-editor.stories.tsx` 增加「轮次结束后仍展示该轮对话」的 story。
- `ui/prototypes/index.html`：该屏已登记对话卡片、工具调用行与待确认卡片；补记「轮次结束后保留最近一轮对话」的既有状态，不新增视觉规则。

## Non-goals

- 不改 `backend/`、不动 SSE 事件契约、不新增 message/tool 推送事件。
- 不新增页面视觉模式，不重做 RunPanel 布局。
- 不改数据库模型与配置。

## Acceptance Criteria

- [ ] 运行中面板能看到用户消息、Agent 文本回复与工具活动行；approval 模式的待确认卡片、approve/reject、预算、`starting` 启动态均不退化。
- [ ] 轮次 finalize 后面板仍展示该轮对话（不再回到「还没有对话」）。
- [ ] `ui/src/lib/run-api.test.ts` 覆盖「没有 open 轮次时取最新已结束轮次」与「会话消息进入 timeline 且与轮次投影去重」。
- [ ] `ui/src/components/run-panel.test.tsx` 覆盖「已结束轮次仍渲染对话」「SSE turn.updated 触发刷新」。
- [ ] `pnpm -C ui test`、`pnpm -C ui run build`、`archkit inspect .` 全绿。
- [ ] 合并到 main 后用无头 Playwright 走真实页面：可见用户消息与 Agent 回复；有 pending 时 approve 后确认后续变化；轮次结束后对话仍在；控制台 0 error；`section[aria-label]` 全程为 3。

## Implementation

- `ui/src/lib/run-conversation.ts`（新增）：`sessionMessageText` 解析不透明 content 的三种形状（wire 字符串 / `{content}` / `{text}` 最终回复）；`buildConversationTimeline` 把 user / assistant 文本与 assistant toolCalls 投影为 `RunTimelineEvent`（system 与 tool 结果有意不渲染）；`buildRunTimeline` 合并会话时间线与轮次投影，会话已有用户消息时丢弃 `turn.message` 同文副本，finalize 事件始终保留，会话为空时原样回退轮次投影。
- `ui/src/lib/api.ts` `getActiveRun`：请求改为不带 state 的 `GET /resumes/{id}/turns`，用 `turns.find(state === "open") ?? turns[0]` 实现「优先 open、否则最新一轮」；拿 `turn.sessionId` 拉 `GET /sessions/{id}/messages`，失败时静默退回轮次投影；新增 `GetActiveRunOptions.withConversation`（默认 true），`getWorkbenchSummary` 传 `false` 避免逐份简历拉全量会话。
- `ui/src/components/run-panel.tsx`：新增「轮次未关闭时每 1.5s invalidate active-run」的轮询（SSE 只在轮次投影变化时推送，会话消息变化不触发），工具活动行改为可省略空摘要、text 长时换行。
- `ui/src/mocks/handlers.ts`：`sess_now` 返回 mock 会话对话；`ui/src/pages/resume-editor.stories.tsx` 新增 `ConversationAfterFinalize` story；`ui/prototypes/index.html` #screen-editor 补记「轮次结束后保留最近一轮对话」。
- 测试：`ui/src/lib/run-conversation.test.ts`（新增 5 条）、`ui/src/lib/run-api.test.ts`（新增 4 条，含 state 过滤、会话投影、去重、失败回退、跳过对话）、`ui/src/components/run-panel.test.tsx`（新增 3 条：已结束轮次仍渲染对话、工具活动行、轮询开关）。

## Verification

TDD Red（实现前）：

```text
pnpm -C ui exec vitest run src/lib/run-conversation.test.ts src/lib/run-api.test.ts src/components/run-panel.test.tsx
→ run-conversation.test.ts 无法解析 @/lib/run-conversation（模块不存在）
→ run-api.test.ts > projects the session conversation into the timeline ... expected false to be true
→ run-panel.test.tsx > 轮次未关闭时轮询 active-run ... Number of calls: 0
2 failed | 23 passed
```

Green（实现后）：

```text
pnpm -C ui test        → Test Files 38 passed (38) / Tests 287 passed (287)
pnpm -C ui run build   → ✓ built
archkit inspect .      → Quality gates passed.
```

合并到 main 后的真实页面端到端实证见关单提交（截图与采样文本）。

## Related ADRs

- None.
