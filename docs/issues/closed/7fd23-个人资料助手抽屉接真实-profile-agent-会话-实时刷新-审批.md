---
id: 7fd23
status: closed
created_at: 2026-10-02T02:39:08.089Z
updated_at: 2026-10-02T02:44:05.263Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-10-02T02:39:17.723Z
closed_at: 2026-10-02T02:44:05.263Z
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

- [x] 抽屉发消息：无会话时新建（或复用最近一个）→ `POST /sessions/{id}/messages` → `POST /sessions/{id}/runs`，有测试证明会发出这两个请求。
- [x] 订阅 `GET /turns/{id}/events`；收到 `turn.updated` 后刷新 `GET /sessions/{id}/turns` 与增量 messages，并渲染 Agent 文字回复。
- [x] 待确认的主档改动用既有 `PendingActionCard` 渲染；approve 调 `POST /pending-actions/{id}/approve` 并刷新主档查询，reject 调 `POST /pending-actions/{id}/reject`。
- [x] 卸载时关闭 EventSource；StrictMode 下任一时刻只有一个活跃连接（不得用「cleanup 置标志丢弃结果」的 62adb 式写法）。
- [x] `parseProfileInput` 及其启发式死代码、类型、测试已清除，仓库内无引用。
- [x] `MODEL_NOT_CONFIGURED` / `RATE_LIMITED` / 运行体不可用分别显示可读 i18n 文案，且不回显服务端原始 message。
- [x] `pnpm -C ui test` 不少于基线 29 files / 220 条且无退化；`pnpm -C ui build`、`archkit inspect .` 通过。

## Implementation

- `ui/src/lib/types.ts`：新增 `AgentSession` / `AgentSessionMessage` / `SessionMessageInput`；`ApiTurn` 增加 `scope`、`resumeId` 允许 null，`ApiTurnPendingAction.kind` 增加 `profile_change`、`targetResource` 允许 null；删除已无引用的 `ProposedFactChange` / `ProposedBasicsChange` / `ProfileInputResult`。
- `ui/src/lib/api.ts`：新增 `createSession` / `listSessions` / `listSessionMessages`（`afterSeq` 增量）/ `appendSessionMessage` / `listSessionTurns` / `startProfileRun` 并导出 `mapPendingAction`；删除启发式路径 `parseProfileInput` / `parseFactFromText` / `createFact` / `heuristicParseBasics` / `heuristicParseFact`。`heuristicParseJd` 保留：JD 创建仍走本地解析，不在本工单范围。
- `ui/src/components/profile-assistant.tsx`：首次发消息时复用 `GET /sessions` 首条会话或 `POST /sessions` 新建；读会话历史算出下一个 `seq` 后 `POST /sessions/{id}/messages` 记录用户消息，再 `POST /sessions/{id}/runs` 起 profile run。订阅 `GET /turns/{id}/events`，`turn.updated` 触发轮次失效与 `afterSeq` 增量拉取；会话消息投影成对话气泡（相邻同文折叠，兼容运行体镜像的同一句用户消息），待确认主档改动复用 `PendingActionCard`，approve/reject 走真实端点并在成功后失效 `["session-turns", id]` 与 `["profile"]`。cleanup 直接返回 `subscribeTurnEvents` 的退订函数，不置标志丢弃结果。
- `ui/src/components/profile-workspace.tsx`：`["profile"]` 重新取数后把新数据同步进本地副本，审批写入的主档立即在页面可见；移除只服务旧启发式卡片的 `onCommitFact` / `onCommitBasics` props。
- `ui/src/lib/agent-error.ts`：新增机器错误码 → i18n 键映射（`MODEL_NOT_CONFIGURED` / `RATE_LIMITED` / `NETWORK_ERROR` / generic），`run-panel.tsx` 改用同一函数，抽屉与工作台共用同一套 `workbench.run.errors.*` 文案。
- `ui/src/mocks/handlers.ts`：按冻结契约补 `/sessions`、`/sessions/{id}/messages`、`/sessions/{id}/turns`、`/sessions/{id}/runs` handlers。
- i18n：**无新增键**，复用 `profile.assistant.*`（intro / suggestion / thinking / placeholder / send）、`common.pendingAction.*`、`common.actions.*`、`workbench.run.errors.*`、`agentOnboarding.state.*`；删除只服务已移除启发式的 `profile.assistant.discard`、`profile.assistant.msg.*`、`profile.assistant.factCard.*`、`profile.assistant.basicsCard.*` 与 `api.basics.*`、`api.fact.*`。
- 测试：新增 `ui/src/lib/session-api.test.ts`（5 条，断言真实 METHOD + path / `afterSeq` / 请求体 / profile 待办映射）；重写 `ui/src/components/profile-assistant.test.tsx`（10 条：3 条可用性引导 + 发消息起 run + `turn.updated` 拉取渲染 + approve 刷新主档 + reject + StrictMode 连接数 + 两条错误码负向断言）。
- 文档：`README.md` 测试口径与「已知边界」同步；`.freak` 记录 `GET /sessions/{id}/turns` 尚未在后端落地与「复用最近会话 + 前端分配 seq」的口径。

未做（见 Non-goals）：`GET /sessions/{id}/turns` 的端到端真实链路验证要等并行后端工单；未做会话管理界面；未做 full_access 的 profile 直写展示。

## Verification

红（实现前）：

```console
$ pnpm -C ui test src/lib/session-api.test.ts src/components/profile-assistant.test.tsx
 Test Files  2 failed (2)
      Tests  12 failed | 3 passed (15)
```

失败原因是 session 函数尚不存在（`createSession is not a function` 等），抽屉仍调用 `parseProfileInput`。

绿：

```console
$ pnpm -C ui test
 Test Files  30 passed (30)
      Tests  232 passed (232)

$ pnpm -C ui build
 ✓ built in 455ms
（仅有既有的 >500kB chunk 体积提示）

$ archkit inspect .
Quality gates passed.
```

基线 29 files / 220 条，现 30 files / 232 条（新增 1 个测试文件、12 条，0 退化）。

## Related ADRs

- None.
