---
id: bb89f
status: closed
created_at: 2026-10-09T16:47:28.449Z
updated_at: 2026-10-09T17:00:55.036Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:47:40.827Z
closed_at: 2026-10-09T17:00:55.036Z
---

# 个人资料助手抽屉面板真实接线：新建会话 / 历史切换 / 继续对话 / runError

## Background

9b0df 已完成 Storybook 先行：`ui/src/components/profile-assistant-panel.tsx` 是纯 props 展示层，`ui/src/components/profile-assistant-panel.stories.tsx` 覆盖新建对话入口 / 当前与历史切换 / 历史列表三态 / 详情 / 失效待办全部状态，用户已确认视觉与交互。但该面板至今是零接线组件：抽屉真实正文仍是 `ui/src/components/profile-assistant.tsx` 里手写的单视图气泡流，没有新建对话入口，也没有历史会话切换。

同时抽屉的 AI 引导接的是旧信号：`agentAvailability` 只传了 `keyConfigured`，没有传 `model.lastTest`，所以「已配置但凭据被上游拒绝」（`auth_failed`）判不出来；`AgentAvailabilityNotice` 也没有传 `credentialHint`，掩码尾号不显示。

本轮按 `new-react-page` 第 2 步把已确认面板接进真实抽屉，复用既有会话契约：`GET /sessions`、`GET /sessions/{id}/messages`、`POST /sessions`、`POST /sessions/{id}/messages`、`POST /sessions/{id}/runs`、`GET /sessions/{id}/turns`（契约 §19 / §21）。不新增后端接口。

## Scope

- `ui/src/components/profile-assistant.tsx`：抽屉正文替换为 `ProfileAssistantPanel`；接真实 `mode`（current / history）、新建会话、历史列表与详情切换、历史会话续聊写入**所选** session、runError 展示；AI 引导补 `lastTest` 与 `credentialHint`。
- `ui/src/components/profile-assistant-panel.tsx`：只在 props 契约需要时微调（如把待办回调、runError 透传给展示层），不新增请求。
- `ui/prototypes/index.html`：同步「个人资料助手抽屉」区块，登记真实接线后的交互。
- 新增 `ui/src/components/profile-assistant-panel.*.test.tsx` / `.stories.tsx` 中与新接线相关的 story 与断言。
- i18n：`ui/src/i18n/locales/{zh-CN,en}/profile.ts` 补齐新文案，键结构一致。

## Non-goals

- 不改后端、数据库迁移、`compose.yaml`。
- 不改 `ui/src/components/session-history.tsx`、`ui/src/components/agent-onboarding.tsx`、`ui/src/components/kit/run-error.tsx` 的实现（只复用）。
- 不改 `ui/src/lib/api.ts`、`ui/src/lib/types.ts`（既有接口已够用）。
- 不做「历史会话重命名 / 删除」，不做分页。

## Acceptance Criteria

- [x] 抽屉正文渲染 `ProfileAssistantPanel`，「当前对话 / 历史会话」两态可切换。
- [x] 点「新建对话」真的调用 `POST /sessions`，创建中按钮禁用并显示「正在新建对话…」，重复点击不发起第二次请求。
- [x] 历史列表来自 `GET /sessions`，行内不出现会话 ID，按 `groupSessionsByTime` 的时间分组（今天 / 昨天 / 7 天内 / 30 天内 / 更早）渲染。
- [x] 点历史某一行真的切到该 session 并加载其消息（`GET /sessions/{id}/messages`），详情标题用派生标题（无标题走兜底）。
- [x] 历史会话底部继续输入：把消息 `POST /sessions/{选中 id}/messages` 并带同一 id 起 run（`POST /sessions/{选中 id}/runs`），绝不写回最新会话。
- [x] AI 引导：`agentAvailability` 传 `lastTest`，凭据被拒判为 `auth_failed`；`AgentAvailabilityNotice` 传 `credentialHint={model.lastTest?.message}`，只渲染掩码尾号。
- [x] 未配置 / 凭据失效 / 运行体不可用时**不放行聊天**（无输入框），显示引导与「去设置」跳转。
- [x] 消息带 `runError` 时抽屉内展示 `RunErrorBlock`：类别、provider/model、key 掩码尾号、「去设置更新 Key」、重试。
- [x] 测试含正向与负向断言；负向：不得出现完整 key、`Authorization`、`Traceback`。
- [x] `pnpm -C ui test`、`pnpm -C ui exec tsc -b --noEmit`、`node quality-gates/run.js`、`archkit inspect .` 全绿。
- [x] 原型 `#screen-profile` 的助手抽屉区块与实现一致。

## Implementation

- `ui/src/components/profile-assistant.tsx`：抽屉正文换成 `ProfileAssistantPanel`，本文件只保留数据与会话作用域。
  - `mode: current | history` 受控；`createdSessionId`（新建对话 / 首次发送）与 `historySessionId`（历史选中）分离。
  - 新建对话：`createMutation` 调 `POST /sessions`，成功后切成当前会话并清空本地历史；`creating` 透给面板禁用入口。
  - 历史列表：`sessionsQuery` 直接消费后端 `GET /sessions` 的 `title` / `messageCount`（issue 360b1），不再逐会话拉消息。
  - 历史详情：选中某行后 `GET /sessions/{选中 id}/messages`。
  - 继续对话：`sendMutation({ target, text })`，历史视图 target = 选中 id，当前视图 target = 当前会话；首次发送用 `queryClient.ensureQueryData(["profile-session"])` 复用（含在途）已发现的主档会话，没有才 `POST /sessions`，修掉「可用性刚就绪、会话发现未回」误建新会话的竞态。
  - 可用性：`agentAvailability` 传 `model.lastTest` 判 `auth_failed`；`credentialHint` 只传 `maskedCredentialTail(model.lastTest?.message)`，拿不到掩码一律 null。
  - 运行失败 / 待办：把 `activeTurn.runError`、`onRetry`、approve / reject、busy 透给面板；错误按当前视图分流（当前对话给运行错误，历史给 `panel.loadError`）。
- `ui/src/components/profile-assistant-panel.tsx`：`ProfileCurrentRun` 扩 `runError` / `onRetry` / `onApprove` / `onReject` / `busyActionId`；渲染共享 `RunErrorBlock`，把待办回调与 busy 透给 `PendingActionCard`；新增 `bodyRef` 供抽屉续用自动滚底；根容器 `flex-1 min-h-0` 适配抽屉。
- `ui/src/i18n/locales/{zh-CN,en}/profile.ts`：新增 `assistant.panel.loadError`。
- `ui/src/lib/types.ts`：`AgentSession` 补可选 `title` / `messageCount`（与后端字段名一致）。
- 测试：`profile-assistant.test.tsx` 新增「面板真实接线」8 条（新建会话 / 创建中禁用 / 历史标题与分组与无 ID / 历史续聊写对 session 负向 / 凭据被拒不放行 / 明文 key 不渲染 / runError 展示 / runError 重试）；`profile-assistant-panel.test.tsx` 新增待办回调与 runError 3 条；`profile-assistant-panel.stories.test.tsx` 新增 `CurrentSessionRunError` 1 条。
- Storybook：`profile-assistant-panel.stories.tsx` 新增 `CurrentSessionRunError`（RunErrorBlock 需 Router，story 内包 `MemoryRouter`）。
- 原型：`ui/prototypes/index.html` 的「个人资料助手抽屉」区块补真实接线说明、当前对话新增 runError 视觉块与 6 条状态登记；AI 引导段落补 `lastTest` 与 `credentialHint` 口径。

## Verification

- `pnpm -C ui exec tsc -b --noEmit` → exit 0，无输出。
- `pnpm -C ui test` → `Test Files 81 passed (81)` / `Tests 649 passed (649)`。
- `node quality-gates/run.js` → `Quality gates passed.`（exit 0）。
- `archkit inspect .` → `Quality gates passed.`（exit 0）。
- Storybook `pnpm -C ui exec storybook dev -p 6007 --no-open --ci --quiet`：story id `pages-profileassistantpanel--current-session-run-error`（另有既存 9 个 panel story）在 `/index.json` 中存在。
- 原型静态校验：`#screen-profile` 的助手抽屉区块含新建对话 / 当前与历史切换 / runError 块 / AI 引导文案。

## Related ADRs

- None.
