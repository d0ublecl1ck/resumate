---
id: a2cfa
status: in-progress
created_at: 2026-10-07T09:30:00.000Z
updated_at: 2026-10-07T09:35:00.000Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-07T09:16:57.584Z
---

# 原型与 Storybook 补模型测试连接结果状态

## Background

`ui/src/components/settings-form.tsx` 的「测试连接」目前调 `testModelConnection` 不带 body，测的是已保存配置而不是表单当前值；且 `testResult = testMutation.data ?? model.lastTest` 会把持久化的旧结果当成刚测的结果显示，用户曾因此误判。

用户已同意后续改动内容（本轮不实现）：① 测试按钮把当前表单的 provider / endpoint / model 与本次输入的 apiKey 一起发送，未输入 apiKey 时不传 `api_key`；② 显示持久化的 `lastTest` 而非本次结果时，补一句「上次测试：<时间>」。

按仓库强顺序（原型 → Storybook 给用户确认 → 才真实开发），本轮只补原型状态与 Storybook 呈现，等用户确认。

## Scope

- 原型 `ui/prototypes/index.html` 的 `#screen-settings` 模型配置卡片补「测试结果行」的四种状态：测试中 / 传输失败 / 业务失败带 message / 持久化结果补「上次测试：<时间>」；并同步该屏 `<ul class="states">` 的状态说明。
- `ui/src` 侧只新增/调整 Storybook 呈现：新增测试结果行的状态确认 story（含渲染测试），并补齐 i18n 词条。

## Non-goals

- 不改 `ui/src/components/settings-form.tsx` 的任何行为或渲染。
- 不实现「测试连接发送表单当前值」，也不实现持久化结果的时间标注。
- 不改 `backend/`（`POST /models/config:test` 已支持 `ModelConfigUpdate` payload）。

## Acceptance Criteria

- [x] 原型 `#screen-settings` 模型配置卡片出现测试结果行，覆盖测试中 / 传输失败 / 业务失败带 message / 持久化结果的「上次测试：<时间>」。
- [x] 原型该屏 `<ul class="states">` 状态说明同步。
- [x] Storybook 变更只涉及 story 文件与 i18n，`settings-form.tsx` 零改动。
- [x] `pnpm -C ui test`、`pnpm -C ui run build-storybook`、`archkit inspect .` 通过。

## Implementation

- 原型 `ui/prototypes/index.html` 的 `#screen-settings` 模型配置卡片：在「保存 / 测试连通性」按钮下新增结果行示例，
  用与实现一致的 lucide 图标（refresh-cw / triangle-alert / circle-check 内联 SVG）列出四种状态：
  测试中、传输失败、业务失败（后端 message 原文）、持久化结果附「上次测试：2026-09-19 20:00」。
  同步该屏 `<ul class="states">` 增加「模型测试结果行」一条说明。
- 新增 `ui/src/components/model-test-result.stories.tsx`：用与实现相同的 Tailwind 令牌与 lucide 图标复刻结果行，
  导出 `AllStates` / `Testing` / `TransportFailure` / `BusinessFailure` / `PersistedLastTest` 五个 story，
  供用户在浏览器中确认四种状态。
- 新增 `ui/src/components/model-test-result.stories.test.tsx`：断言四种状态各自渲染的文案，以及持久化态同时出现结果与「上次测试：<时间>」。
- i18n：`settings.model.lastTest` 由未使用的 `上次：{{message}}` 改为时间标注 `上次测试：{{time}}`
  （en: `Last tested: {{time}}`），供持久化结果行与后续实现复用。
- `.freak`：把测试结果行标记为「已登记、待用户确认后落地」，并新增一条待办记录实现要点（发送表单值、未输入 apiKey 时不传 `api_key`）。

## Verification

真实实现未改动，用现有测试套件、Storybook 构建与项目门禁作为证据。

```console
$ pnpm -C ui test
 Test Files  36 passed (36)
      Tests  264 passed (264)

$ pnpm -C ui run build-storybook
 Storybook build completed successfully

$ archkit inspect .
Quality gates passed.
```

## Related ADRs

- None.
