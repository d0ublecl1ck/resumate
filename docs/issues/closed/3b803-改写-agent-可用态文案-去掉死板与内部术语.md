---
id: 3b803
status: closed
created_at: 2026-10-01T10:20:00.000Z
updated_at: 2026-10-01T01:59:03.615Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T10:20:30.000Z
closed_at: 2026-10-01T01:59:03.615Z
---

# 改写 Agent 可用态文案，去掉死板与内部术语

## Background

用户指出 `agentOnboarding.state.available` 的文案「太死板了，很 AI 味」。原文有两个问题：

1. **泄露内部术语**：`运行体在线且模型可用` 是我们自己的架构词汇（运行体 = runner 进程），用户既不知道也不关心；「在线且可用」是系统状态播报，不是对人说话。
2. **句式翻译腔**：`描述你的经历，助手给出待确认的改动，你确认后才写入主档` 是并列短句堆叠的说明书语气，同一句里塞了三个动作。

## Scope

改写 `agentOnboarding` 命名空间下 `available` 状态的 `title` 与 `description`（zh-CN 与 en 保持语义一致），并同步两条断言旧文案的 story 测试。其余两态（`model_missing` / `runtime_offline`）本轮不动。

## Non-goals

- 不动 `stamp` 与 `action`。
- 不动 `model_missing` / `runtime_offline` 的文案。
- 不改组件结构、不重新走 Storybook 确认流程（用户已明确「页面交互没问题，不用再给我看 Storybook」）。

## Acceptance Criteria

- [x] zh-CN 与 en 的 `available.title` / `available.description` 均已改写，en 不留中文、两语言语义一致。
- [x] 文案不再出现「运行体」这类内部术语。
- [x] 引用旧文案的两条 story 断言同步更新。
- [x] `pnpm -C ui test` 与 `archkit inspect .` 通过。

## Implementation

- zh-CN `available.title`：`助手已就绪` -> `随时可以开始`
- zh-CN `available.description`：`运行体在线且模型可用。描述你的经历，助手给出待确认的改动，你确认后才写入主档。` -> `直接说你的经历就行，助手会先给出一版改法，你确认之后才会写进主档。`
- en `available.title`：`Assistant ready` -> `Ready when you are`
- en `available.description`：`The runtime is online and the model is usable. Describe an experience and the assistant proposes a change you confirm before it is written.` -> `Just describe what you did. The assistant drafts the edit first, and nothing is written to your profile until you approve it.`
- `ui/src/components/agent-onboarding.stories.test.tsx`：两处 `getByText("助手已就绪")` -> `getByText("随时可以开始")`。

改写理由：「运行体在线且模型可用」是给我们自己看的架构状态，用户看到的应该是「现在能做什么」；改成对第二人称说话、一句话说清「先说 → 助手起草 → 你确认才写入」这个顺序，去掉并列短句的说明书腔。

## Verification

- `pnpm -C ui test` -> `Test Files 28 passed (28)` / `Tests 215 passed (215)`（0 退化）。
- `archkit inspect .` -> `Quality gates passed.`（含 `ui-i18n` 键结构一致与 en 无中文校验）。
- 本次只改两个 locale 文件与一个测试文件，未动组件结构。

## Related ADRs

- None.
