---
id: a2cfa
status: closed
created_at: 2026-10-07T09:30:00.000Z
updated_at: 2026-10-07T09:26:34.031Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-07T09:16:57.584Z
closed_at: 2026-10-07T09:26:34.031Z
---

# 原型、Storybook 与实现补模型测试连接结果状态

## Background

`ui/src/components/settings-form.tsx` 的「测试连接」原先调 `testModelConnection` 不带 body，测的是已保存配置而不是表单当前值；且 `testResult = testMutation.data ?? model.lastTest` 会把持久化的旧结果当成刚测的结果显示，用户曾因此误判。

按仓库强顺序先补了原型状态与 Storybook 确认稿（commit `94b851f`）。用户在 2026-10-07 确认接受后，本工单继续完成真实对接：
① 测试按钮把当前表单的 provider / endpoint / model 与本次输入的 apiKey 一起发送，apiKey 未输入时不进 payload；
② 显示持久化的 `lastTest` 而非本次结果时，补一句「上次测试：<时间>」。

## Scope

- 原型 `ui/prototypes/index.html` 的 `#screen-settings` 模型配置卡片补「测试结果行」的四种状态，并同步该屏 `<ul class="states">` 状态说明。
- `ui/src` 侧先新增 Storybook 确认稿（story 与其渲染测试），用户确认后再落地实现。
- `ui/src/lib/api.ts`：`testModelConnection` 接受 `ModelConfigUpdate` 并作为 `POST /models/config:test` 的 body。
- `ui/src/components/settings-form.tsx`：测试连接发送表单当前值（apiKey 为空则不传）；持久化结果补「上次测试：<时间>」；`settings.model.lastTest` 传 `time` 参数。

## Non-goals

- 不改 `backend/`（`POST /models/config:test` 已支持 `ModelConfigUpdate` payload，后端语义 None=沿用已存 key、空串=清空）。
- 不改保存模型配置的流程，也不把本次输入的 apiKey 落库到界面状态。
- 不 push、不建 PR、不改远端。

## Acceptance Criteria

- [x] 原型 `#screen-settings` 模型配置卡片出现测试结果行，覆盖测试中 / 传输失败 / 业务失败带 message / 持久化结果的「上次测试：<时间>」。
- [x] 原型该屏 `<ul class="states">` 状态说明同步。
- [x] Storybook 新增测试结果行状态确认 story，且确认阶段 `settings-form.tsx` 零改动。
- [x] 测试连接把表单当前 provider / endpoint / model 与本次输入的 apiKey 一起发送。
- [x] API Key 输入框为空时不发送 apiKey（测试守住，payload 只有 provider / endpoint / model）。
- [x] 显示持久化的 `lastTest` 时补「上次测试：<YYYY-MM-DD HH:mm>」；本次点击得到的结果不显示该时间。
- [x] `settings.model.lastTest` 改为传 `time` 参数，zh-CN 与 en 键结构一致。
- [x] `pnpm -C ui test`、`pnpm -C ui run build-storybook`、`archkit inspect .` 通过。

## Implementation

- 原型 `ui/prototypes/index.html` 的 `#screen-settings` 模型配置卡片：按钮下新增结果行示例，用与实现一致的 lucide 图标内联 SVG
  （refresh-cw / triangle-alert / circle-check）列出四态：测试中、传输失败、业务失败（后端 message 原文）、持久化结果附
  「上次测试：2026-09-19 20:00」；该屏 `<ul class="states">` 同步补一条说明。
- 新增 `ui/src/components/model-test-result.stories.tsx`（`AllStates` / `Testing` / `TransportFailure` / `BusinessFailure` /
  `PersistedLastTest`）与 `ui/src/components/model-test-result.stories.test.tsx`，作为用户确认稿。
- `ui/src/lib/api.ts`：`testModelConnection(patch: ModelConfigUpdate = {})` 改为把 patch 作为 POST body。
- `ui/src/components/settings-form.tsx`：`testMutation.mutationFn` 组装 `{ provider, endpoint, model: modelName, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }`；
  新增 `testResultFromLastTest = !testMutation.data && Boolean(model.lastTest)`，结果行在该标志为真时补
  `· {t("settings.model.lastTest", { time: testResult.at.slice(0, 16).replace("T", " ") })}`。
- i18n：`settings.model.lastTest` 由未使用的 `上次：{{message}}` 改为 `上次测试：{{time}}`（en `Last tested: {{time}}`）。
- `.freak`：更新原型↔实现差异条目，并把「测试连接发送表单值」的实现要点标记为已落地。

## Verification

TDD：先在 `ui/src/components/settings-form.test.tsx` 加断言并确认 Red，再改实现。

```console
$ pnpm -C ui test -- src/components/settings-form.test.tsx   # Red（改实现前）
 Tests  3 failed | 265 passed (268)
  × 测试连接把当前表单的 provider / endpoint / model 与本次输入的 API Key 一起发送
  × API Key 输入框为空时不发送 apiKey，沿用已存 key
  × 显示持久化的上次测试结果时补「上次测试：<时间>」

$ pnpm -C ui test                                            # Green（改实现后）
 Test Files  36 passed (36)
      Tests  268 passed (268)

$ pnpm -C ui run build-storybook
 Storybook build completed successfully

$ archkit inspect .
Quality gates passed.
```

## Related ADRs

- None.
