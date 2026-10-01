---
id: 80ae8
status: closed
created_at: 2026-10-01T00:57:40.619Z
updated_at: 2026-10-01T01:02:24.897Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T00:57:50.748Z
closed_at: 2026-10-01T01:02:24.897Z
---

# 接入 Agent 可用性引导到助手与设置页并精简未接入文案

## Background

`AgentAvailabilityNotice` 已在 2792f 交付并经用户确认 Storybook 视觉与文案，但当时只到 Storybook，没有接进真实页面：个人资料助手抽屉仍渲染可对话的界面，设置页也没有任何「AI 为什么不动」的说明。而当前没有任何运行体进程在处理 Agent 请求（AgentRuntime 未接入），这些界面会让人误以为能用。

本工单把已确认的引导接进两个落点，并按用户要求删除 `runtime_offline` 描述结尾那句多余文案。

状态来源只有一个可用信号：`GET /models/config` 的 `keyConfigured`——`false` 派生 `model_missing`，`true` 派生 `runtime_offline`（运行体就绪信号尚不存在，`available` 只保留在 Storybook）。

## Scope

- i18n：删除 `agentOnboarding.state.runtime_offline.description` 结尾一句（zh-CN 与 en 同步，语义一致）。
- `ui/src/components/profile-assistant.tsx`：抽屉正文按可用性渲染——阻断时显示 `AgentAvailabilityNotice placement="panel"`，`model_missing` 的主操作跳转 `/settings`；不再出现可对话的输入与发送入口。
- `ui/src/components/settings-form.tsx`：Agent 分区入口显示 `AgentAvailabilityNotice placement="entry"`，`model_missing` 的主操作滚动到模型配置分区。
- 新增/更新测试：`profile-assistant.test.tsx` 与 `settings-form.test.tsx` 覆盖两个落点、两种阻断态与「无对话输入」的负向断言。

## Non-goals

- 不改 `ui/src/lib/api.ts` 中 `getActiveRun` 的 mock，不做 run / PendingAction 审批的真实接线（依赖另一工单的会话层）。
- 不编造「运行体已就绪」信号；`available` 在就绪信号落地前只存在于 Storybook。
- 不改后端接口、`GET /models/config` 契约与既有查询键。
- 不新增页面视觉规则，不使用吉祥物角色层；沿用已确认的 `AgentAvailabilityNotice`。

## Acceptance Criteria

- [x] zh-CN 与 en 的 `agentOnboarding.state.runtime_offline.description` 均删去结尾那句，且两语言语义一致。
- [x] `profile-assistant.test.tsx`：`keyConfigured=false` 时抽屉出现「先配置一个模型」「去设置模型」，且无对话输入；`keyConfigured=true` 时出现「AI 能力尚未接入」，同样无对话输入。
- [x] `settings-form.test.tsx`：Agent 分区按 `model.keyConfigured` 显示对应引导；`model_missing` 时「去设置模型」可用。
- [x] `pnpm -C ui test`、`pnpm -C ui build-storybook`、`archkit inspect .` 全部通过。

## Implementation

- **文案**：`ui/src/i18n/locales/zh-CN/agentOnboarding.ts` 与 `en/agentOnboarding.ts` 的 `state.runtime_offline.description` 删去结尾从句（zh 的「——界面不会假装能跑。」、en 的「— this screen will not pretend otherwise.」）。
- **助手**：`profile-assistant.tsx` 用 `useQuery({ queryKey: ["model-config"], queryFn: getModelConfig, enabled: open })` 取模型配置，`agentAvailabilityFromModelConfig(...)` 派生可用性；抽屉正文在非 `available` 时渲染 `AgentAvailabilityNotice placement="panel"`，主操作 `navigate("/settings")`；可对话正文（消息区 + `<form>` 输入）只在 `available` 时渲染。
- **设置页**：`settings-form.tsx` 的 Agent 分区顶部插入 `AgentAvailabilityNotice placement="entry"`，状态直接取自组件已有的 `model` prop（父级已查询，避免重复请求）；`Section` 增加可选 `id`，模型分区加 `id="settings-model-section"`，主操作滚动到该分区。
- **与原计划的偏差（如实记录）**：
  1. 未新增 `useAgentAvailability()` hook——助手内直接用 `useQuery`，设置页直接用 `model` prop，两处都无需新增抽象。
  2. 助手新增 hook 依赖后，`profile-workspace.test.tsx` 因缺少 `QueryClientProvider` 报 "No QueryClient set"（6 条失败）；已为该测试的 render 补上 provider。这是原计划未预见但必要的改动。
  3. `settings-form.test.tsx` 原写的是 `getByText(/没有运行体进程在处理 Agent 请求/)`，与真实文案「还没有**任何**运行体进程…」不匹配；已改为断言完整描述文案（更强的断言，而非放宽）。
- **story 未改**：组件对外 API 未变，`agent-onboarding.stories.tsx` 仍渲染真实组件，`build-storybook` 通过。

## Verification

- `pnpm -C ui test` → `Test Files 25 passed (25)` / `Tests 186 passed (186)`（新增 1 个测试文件、+4 条用例；其余 182 条不退化）。
- `pnpm -C ui build-storybook` → `Storybook build completed successfully`。
- `archkit inspect .` → `Quality gates passed.`（含 `ui-i18n` 键结构与 en 无中文、`ui-form-contract`）。
- 红→绿：实现前 `profile-assistant.test.tsx` 因模块/断言不存在而失败；实现后与 `settings-form.test.tsx` 一并通过。
- `README.md` 测试口径由 `24 files / 182 passed` 更新为 `25 files / 186 passed`；`.freak` 的 `agent-onboarding` 线索改写为「已接入、但 `available` 仍只存在于 Storybook」。

## Related ADRs

- None.
