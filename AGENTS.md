# 质量门禁
- **AFTER_CODING**: 每次代码变更完毕后 -> **MUST** 运行 `archkit inspect .` 执行同步后的项目质量门禁。
- **IF** 门禁未通过 -> **MUST** 修复问题直到通过，**UNLESS** 获得用户明确同意方可跳过。
- **PRIORITY**: 项目质量门禁规则定义在 quality-gates/gates/ 中，**MUST** 优先遵循项目门禁约束。
- **WHEN** 用户纠正你的代码规范或项目结构约定时 -> **MUST** 询问用户是否要将该规则更新到 quality-gates/gates/ 中。

# FREAK

- [ ] `docs/design.md` — 蓝图仍为模板；项目开始实现后核对架构与目录结构。记录：2026-08-31
