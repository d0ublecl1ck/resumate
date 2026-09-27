# 质量门禁
- **AFTER_CODING**: 每次代码变更完毕后 -> **MUST** 运行 `archkit inspect .` 执行同步后的项目质量门禁。
- **IF** 门禁未通过 -> **MUST** 修复问题直到通过，**UNLESS** 获得用户明确同意方可跳过。
- **PRIORITY**: 项目质量门禁规则定义在 quality-gates/gates/ 中，**MUST** 优先遵循项目门禁约束。
- **WHEN** 用户纠正你的代码规范或项目结构约定时 -> **MUST** 询问用户是否要将该规则更新到 quality-gates/gates/ 中。

# 页面开发

- **BEFORE** 开发、修改或重构任何页面、页面组件、布局或页面样式 -> **MUST** 先读取 `ui/prototypes/index.html` 定稿原型，并遵守其中的视觉、组件、布局、响应式和交互规范；**IF** 原型未覆盖所需状态 -> **MUST** 先在原型中补充对应状态或明确记录待确认项，**MUST NOT** 自行引入未经说明的页面视觉规则。

# 国际化（i18n）

- **BEFORE** 新增或修改任何用户可见文案（页面、组件、导航、按钮、状态、空态、错误提示、`aria-label`、`placeholder`、`title` 等）-> **MUST** 通过 i18n 翻译键渲染，**MUST NOT** 硬编码中文或英文字面量。
- **WHEN** 新增或修改界面文案 -> **MUST** 同步补齐 `ui/src/i18n/locales/zh-CN/` 与 `ui/src/i18n/locales/en/` 对应命名空间的词条，并保持两者键结构一致。
- **WHEN** 文案取值来自枚举、状态或来源 -> **MUST** 使用键映射（如 `t("ns.status." + value, { defaultValue: value })`），**MUST NOT** 直接渲染枚举码。
- **IF** 文案属于用户内容或后端数据（简历正文、JD 正文、事实内容、Diff 原文、Agent 消息、人名等）-> **MUST NOT** 翻译，保持原文（US-13.4）；确需保留的中文字面量用 `i18n-allow` 注释豁免并在注释里说明原因。
- **AFTER** 文案或组件变更 -> **MUST** 运行 `pnpm -C ui test`，并确保 `archkit inspect .` 通过；自定义 `ui-i18n` 门禁会校验键结构一致、en 资源无残留中文、组件与页面无硬编码中文文案。
