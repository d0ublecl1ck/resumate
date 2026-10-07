---
id: 895cd
status: closed
created_at: 2026-10-07T09:14:59.193Z
updated_at: 2026-10-07T09:15:45.077Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-07T09:15:06.713Z
closed_at: 2026-10-07T09:15:45.077Z
---

# 原型补全模型配置的 Endpoint 输入

## Background

仓库规则要求 `ui/prototypes/index.html` 是 `ui/src` 的镜像。真实实现 `ui/src/components/settings-form.tsx` 的模型配置卡片有 Provider / Model / Endpoint / API Key 四个字段，而原型 `#screen-settings` 的模型配置卡片只有 Provider 与 Model 两个 `input`，Endpoint 缺失，原型与实现不一致。

## Scope

- 在 `ui/prototypes/index.html` 的 `#screen-settings` 模型配置卡片里补一个 Endpoint 字段，沿用该卡片既有的 `label.field` + `input.input` 语法与既有令牌，不新增视觉规则。

## Non-goals

- 不补 API Key 字段，也不改该卡片的其它差异；其余差异只在 `.freak` 登记，不在本工单处理。
- 不改 `ui/src` 的任何实现或文案。
- 不改 `backend/`。

## Acceptance Criteria

- [x] `#screen-settings` 的模型配置卡片出现 Endpoint 字段，与既有 Provider / Model 使用同一套 `field` / `input` 语法与令牌。
- [x] 改动只涉及 `ui/prototypes/index.html`，并在 `.freak` 登记剩余的原型 ↔ 实现差异。
- [x] `pnpm -C ui test` 与 `archkit inspect .` 通过。

## Implementation

- `ui/prototypes/index.html`：模型配置卡片（原 Model 那行之后）新增
  `<label class="field" style="margin-top:0"><span>Endpoint</span><input class="input" value="https://api.example-llm.com/v1" /></label>`。
  位置与真实网格一致（Provider / Model / Endpoint / API Key，两列网格里 Endpoint 落在第二行第一列），
  语法沿用同卡片既有 `field` / `input`，取值对齐 `ui/src/lib/content.ts` 的 `MODEL_CONFIG.endpoint`。
- `.freak`：登记该卡片仍存在的四处原型 ↔ 实现差异（缺 API Key 输入、测试按钮文案不同、缺测试结果行、
  缺 Model 上下文窗口/价格提示行与目录加载状态），供后续工单处理。

## Verification

改动是原型静态 HTML，无行为测试；跑现有前端测试套件与项目门禁作为回归证据。

```console
$ pnpm -C ui test
 Test Files  35 passed (35)
      Tests  259 passed (259)

$ archkit inspect .
Quality gates passed.
```

## Related ADRs

- None.
