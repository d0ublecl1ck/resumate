---
id: dbae0
status: closed
created_at: 2026-10-01T10:45:00.000Z
updated_at: 2026-10-01T02:03:39.846Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T10:45:30.000Z
closed_at: 2026-10-01T02:03:39.846Z
---

# 用 gpt-6-astra 重写三态引导文案

## Background

`3b803` 只改写了 `available` 一态，用户仍判定「还是很垃圾」。根因是文案由我自己写：句式仍然是我熟悉的并列短句结构，而且 `model_missing` / `runtime_offline` 两态还在泄露内部术语（模型凭证、Endpoint、API Key、运行体进程、Agent 请求）。

本次改为**把完整背景交给外部模型撰写**：用 codex-api 上可用的最高档模型 `gpt-6-astra`，交代产品定位、用户是谁、提示块出现的位置与结构、三态各自的真实含义、以及硬性禁令（不得出现架构词、不得翻译腔、不得并列短句堆叠、不得营销词），要求中文与英文各写一份且都像母语者所写。

## Scope

重写 `agentOnboarding` 命名空间下三态（`model_missing` / `runtime_offline` / `available`）的 `stamp` / `title` / `description` / `action`（zh-CN 与 en），并同步三个测试文件里对旧文案的断言。

## Non-goals

- 不改组件结构与 props。
- 不改 `agentOnboarding` 之外的文案。
- 不改就绪判定逻辑（另有工单）。

## Acceptance Criteria

- [x] 三态中英双语全部按新文案写入，键结构一致、en 不留中文。
- [x] 文案中不再出现任何架构词（运行体 / 进程 / 模型 / 密钥 / API / Endpoint / Agent / 后端）。
- [x] 三个测试文件中对旧文案的断言全部改为断言新文案。
- [x] `pnpm -C ui test` 与 `archkit inspect .` 通过。

## Implementation

- zh-CN：`model_missing` `还差一步` / `先把助手开起来` / `去设置里把助手需要的信息填好，回来就能开始整理你的经历。` / `去设置`；`runtime_offline` `暂不可用` / `助手暂时不可用` / `助手现在还不能聊天，请稍后再试。`；`available` `可以开始` / `说说你的经历` / `把想到的经历直接告诉我就好，我会先整理一版给你看；你确认后，才会写进个人资料。` / `开始聊聊`。
- en：`One step left` / `Finish setting up` / `Complete the setup in Settings, then come back to start shaping your experience into a resume.` / `Open Settings`；`Not available` / `The assistant is unavailable` / `The assistant isn't available right now, so you can't chat with it yet. Please try again later.`；`Ready to go` / `Tell us your story` / `Just tell me about your experience in your own words. I'll shape it into a draft for you to review before it's added to your profile.` / `Start chatting`。
- 测试：`agent-onboarding.stories.test.tsx`（17 处 + 2 处正则）、`profile-assistant.test.tsx`（10 处）、`settings-form.test.tsx`（6 处）的断言同步；两条正则断言改为断言新描述里的稳定片段（`去设置里把助手需要的信息填好`、`助手现在还不能聊天`），不是放宽成模糊匹配。
- 三态取舍由 `gpt-6-astra` 给出：用户自己能解决的状态给明确入口，不能解决的只说明现状，避免让用户误以为还能自救。

## Verification

- `pnpm -C ui test` -> `Test Files 28 passed (28)` / `Tests 215 passed (215)`。
- `archkit inspect .` -> `Quality gates passed.`（含 `ui-i18n` 键结构一致与 en 无中文校验）。
- 两条正则断言在替换后先失败（`Unable to find an element with the text`），确认它们确实在校验文案，再改为断言新片段后转绿。

## Related ADRs

- None.
