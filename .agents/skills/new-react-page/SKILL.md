---
name: new-react-page
description: 在本项目新增或改造 React 页面、页面组件、布局或交互时的标准流程。用于用户要求「做新页面」「加界面」「改页面」「做个组件」「原型」「Storybook」，或任何涉及 ui/src/pages、ui/src/components 的开发。核心是强顺序：先定稿原型 → 先做 Storybook 给用户确认 → 用户点头后才真实开发与后端对接。
---

# new-react-page：React 页面开发标准流程

## 何时使用

- 用户要求新建或改造页面、页面组件、布局、交互、空态 / 错误态。
- 任何会改动 `ui/src/pages/`、`ui/src/components/` 的任务。

## 铁律：顺序不可颠倒

这是**强顺序**流程。**Storybook 确认是第一步实现动作**；未经用户明确确认，**MUST NOT** 开始真实开发与后端对接。

### 第 0 步：定稿原型

- **BEFORE** 任何实现 -> **MUST** 先读 `ui/prototypes/index.html`，遵守其中的视觉 / 组件 / 布局 / 响应式 / 交互规则。
- **IF** 原型未覆盖所需状态 -> **MUST** 先在原型中补充该状态，或明确记录待确认项；**MUST NOT** 自造未经说明的视觉规则。

### 第 1 步：Storybook 先行（第一步，必须等用户确认）

- 用 Storybook story 把页面 / 组件跑起来；数据一律走 MSW mock，**不接真实后端**。
- **MUST** 覆盖全部状态：默认、空态、加载中、错误、边界 / 超长、禁用、只读等。
- 所有文案走 i18n（zh-CN 与 en 同步）；组件开源优先。
- **MUST** 产出可构建的 `pnpm -C ui build-storybook`。
- **停止点**：把 story 交给用户确认（视觉 + 交互）。用户确认前 **MUST NOT** 进入第 2 步。

### 第 2 步：用户确认后，真实开发与对接

- 接真实 API / 路由 / 数据：补 `ui/src/lib/api.ts` 与类型，把 mock 收敛为真实请求。
- 清理仅为演示存在的临时 mock。
- 补组件 / 页面测试。
- **IF** 后端接口尚不存在 -> **MUST** 先冻结接口契约，再对接（参考 `docs/agent/agent-operation-api.md` 的冻结做法）。

### 第 3 步：验收

- `pnpm -C ui test` 通过。
- `pnpm -C ui build-storybook` 通过。
- `archkit inspect .` 通过（含 `ui-i18n` 门禁）。
- 汇报：用到的原型章节、story 文件、i18n 命名空间。

## 组件与文案规则

- **组件开源优先**：优先 `@base-ui/react`、`lucide-react` 与既有 `ui/src/components/ui`、`ui/src/components/kit`；**MUST NOT** 手写下拉、弹层等基础交互。
- **i18n**：所有用户可见文案走翻译键；zh-CN 与 en 键结构一致；不硬编码中英文；枚举值用键映射；用户内容与后端数据不翻译（US-13.4）。

## 反模式

- 先对接后端、后补 Storybook。
- 用真实接口跑 story。
- 只做「正常态」story，漏掉空 / 错 / 加载态。
- 跳过原型直接造视觉规则。
- 硬编码文案或手写基础组件。

## 交付清单

- [ ] 原型状态已覆盖（或已记录待确认）
- [ ] Storybook story 覆盖全部状态，MSW 驱动，**用户已确认**
- [ ] 真实对接完成，无演示残留
- [ ] i18n 双语键齐全且结构一致
- [ ] 组件开源优先
- [ ] `pnpm -C ui test` / `pnpm -C ui build-storybook` / `archkit inspect .` 通过
