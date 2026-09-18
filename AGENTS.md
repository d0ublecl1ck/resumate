# 质量门禁
- **AFTER_CODING**: 每次代码变更完毕后 -> **MUST** 运行 `archkit inspect .` 执行同步后的项目质量门禁。
- **IF** 门禁未通过 -> **MUST** 修复问题直到通过，**UNLESS** 获得用户明确同意方可跳过。
- **PRIORITY**: 项目质量门禁规则定义在 quality-gates/gates/ 中，**MUST** 优先遵循项目门禁约束。
- **WHEN** 用户纠正你的代码规范或项目结构约定时 -> **MUST** 询问用户是否要将该规则更新到 quality-gates/gates/ 中。

# FREAK

- [ ] `quality-gates/.gate-version` — 当前仅启用 generic 层；增加后端模块时核对 FastAPI 专项门禁覆盖。记录：2026-09-15

# 页面开发

- **BEFORE** 开发、修改或重构任何页面、页面组件、布局或页面样式 -> **MUST** 先读取 `ui/prototypes/index.html` 定稿原型，并遵守其中的视觉、组件、布局、响应式和交互规范；**IF** 原型未覆盖所需状态 -> **MUST** 先在原型中补充对应状态或明确记录待确认项，**MUST NOT** 自行引入未经说明的页面视觉规则。
