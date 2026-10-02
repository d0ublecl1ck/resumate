---
id: 7fd23
status: in-progress
created_at: 2026-10-02T02:39:08.089Z
updated_at: 2026-10-02T02:39:17.723Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-10-02T02:39:17.723Z
---

# 个人资料助手抽屉接真实 profile Agent（会话 + 实时刷新 + 审批）

## Background

- 个人资料助手抽屉当前是假的：用户输入经前端启发式函数 `parseProfileInput`（`ui/src/lib/api.ts`）在浏览器里编出一版改动，由 `ui/src/components/profile-assistant.tsx` 渲染成 `FactCard` / `BasicsCard`，再调用 `createFact` / `updateFact` / `updateBasics` 直写主档。整个过程没有任何 Agent、没有会话、没有运行体。
- 服务端能力已就绪（fef83 / 9d29a / 83c41）：`agent_sessions` / `agent_session_messages` 会话层、`POST /sessions/{id}/runs` 的 profile 作用域 run、`agent_pending_actions.target=profile`、`GET /turns/{id}/events` SSE，以及 `approve|reject` 后真正写主档的审批语义（契约 §19 / §21）。
- 冻结契约（本工单按契约造 MSW，不依赖后端就绪）：`POST /sessions`、`GET /sessions`、`GET|POST /sessions/{id}/messages`（`afterSeq` 增量、`(session_id, seq)` 幂等）、`POST /sessions/{id}/runs`（body `{prompt}`，202）、`GET /sessions/{id}/turns`（`UserTurnResponse[]`，与 `GET /resumes/{id}/turns` 同构、含 `pendingActions`；该端点由并行后端工单新增）、`GET /turns/{id}/events`、`GET /agent/runtime`、`POST /pending-actions/{id}/approve|reject`。
- 既有可复用件：`ui/src/lib/turn-events.ts` 的 SSE 订阅、`ui/src/components/kit/pending-action.tsx` 的 `PendingActionCard`、`ui/src/components/agent-onboarding.tsx` 的三态就绪引导、`workbench.run.errors.*` 的错误码映射。

## Scope

- `ui/src/lib/types.ts`：新增会话 / 会话消息 / 消息入参类型；`ApiTurn` 补齐 `scope` 并允许 `resumeId` 为空（profile 轮次不带简历）。
- `ui/src/lib/api.ts`：按 `request<T>` 既有约定新增 `createSession` / `listSessions` / `listSessionMessages` / `appendSessionMessage` / `listSessionTurns` / `startProfileRun`；注释写 `METHOD + path`。
- `ui/src/components/profile-assistant.tsx`：首次发消息时复用最近会话或新建会话 → 追加用户消息 → 起 profile run；订阅 `GET /turns/{id}/events`，`turn.updated` 刷新 `GET /sessions/{id}/turns` 与增量拉取 messages；Agent 文字回复渲染成对话气泡；待确认的主档改动复用 `PendingActionCard` 渲染；approve/reject 走真实端点并刷新主档查询。
- `ui/src/components/profile-workspace.tsx`：消费刷新后的 `["profile"]` 查询，使审批写入主档后页面可见。
- 移除启发式路径：`parseProfileInput` + `heuristicParseBasics` + `parseFactFromText` + `createFact` + `heuristicParseFact` + `ProfileInputResult` + `ProposedFactChange` + `ProposedBasicsChange`，以及只服务它们的 `content.ts` 夹具体（若有）与测试。
- 错误态：`MODEL_NOT_CONFIGURED` / `RATE_LIMITED` 复用 `workbench.run.errors.*` 映射；运行体 `available=false` 复用 `AgentAvailabilityNotice` 的 `runtime_offline`。
- 文案全部走 i18n（zh-CN / en 键结构一致）。

## Non-goals

- 不碰 `backend/` 与 `agent-core/`；`GET /sessions/{id}/turns` 由并行后端工单落地，本工单只用 MSW 造契约。
- 不新增视觉组件或布局：抽屉布局与待确认卡片沿用已确认设计，复用 `PendingActionCard`，不引入新的页面视觉规则。
- 不做会话管理界面（列表 / 重命名 / 删除）、不做历史会话浏览。
- 不做 full_access 模式的 profile 直写展示；审批语义按 approval 路径实现。

## Acceptance Criteria

- [ ] 抽屉发消息：无会话时新建（或复用最近一个）→ `POST /sessions/{id}/messages` → `POST /sessions/{id}/runs`，有测试证明会发出这两个请求。
- [ ] 订阅 `GET /turns/{id}/events`；收到 `turn.updated` 后刷新 `GET /sessions/{id}/turns` 与增量 messages，并渲染 Agent 文字回复。
- [ ] 待确认的主档改动用既有 `PendingActionCard` 渲染；approve 调 `POST /pending-actions/{id}/approve` 并刷新主档查询，reject 调 `POST /pending-actions/{id}/reject`。
- [ ] 卸载时关闭 EventSource；StrictMode 下任一时刻只有一个活跃连接（不得用「cleanup 置标志丢弃结果」的 62adb 式写法）。
- [ ] `parseProfileInput` 及其启发式死代码、类型、测试已清除，仓库内无引用。
- [ ] `MODEL_NOT_CONFIGURED` / `RATE_LIMITED` / 运行体不可用分别显示可读 i18n 文案，且不回显服务端原始 message。
- [ ] `pnpm -C ui test` 不少于基线 29 files / 220 条且无退化；`pnpm -C ui build`、`archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
