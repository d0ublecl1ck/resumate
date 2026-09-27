---
id: 77f5f
status: closed
created_at: 2026-09-27T03:26:10.823Z
updated_at: 2026-09-27T03:27:13.179Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 设计哲学
started_at: 2026-09-27T03:26:32.691Z
closed_at: 2026-09-27T03:27:13.179Z
---

# 固化 i18n 约定到 AGENTS.md 与质量门禁

## Background

i18n 已在 issue 367f5 落地，但该约定此前只存在于会话过程中；后续新增页面或组件仍可能再次硬编码中文文案，且 zh-CN / en 资源容易漏同步。需要把约定写进仓库内规则，并用项目自有质量门禁自动拦截。

## Scope

- 在 `AGENTS.md` 新增「国际化（i18n）」章节，明确文案落地、双语键同步、枚举映射、用户内容豁免与验证命令。
- 新增项目自定义门禁 `quality-gates/gates/ui-i18n.js`，由 `archkit inspect` / `pnpm run gate` 自动执行，检查：
  - zh-CN 与 en 资源键结构完全一致；
  - en 资源不含未翻译中文（语言名 `简体中文` 除外）；
  - `ui/src/components` 与 `ui/src/pages` 不含硬编码中文界面文案，支持 `i18n-allow` 注释豁免用户数据。
- 为 `ui/src/pages/workbench.tsx` 的用户数据显示名补充 `i18n-allow` 豁免标记。

## Non-goals

- 不修改官方 generic 层门禁，不运行 `inspect --sync`。
- 不检测英文硬编码（误报率高），不引入 AST 解析依赖。
- 不改动既有 i18n 词条内容与组件行为。

## Acceptance Criteria

- [x] `AGENTS.md` 含 i18n 章节，且覆盖文案落地、键同步、枚举映射、用户内容豁免与验证命令。
- [x] `quality-gates/gates/ui-i18n.js` 存在并被 `archkit inspect .` 实际执行。
- [x] 门禁能分别报出键结构不一致、en 残留中文、硬编码中文文案三类问题（负例验证）。
- [x] `archkit inspect .` 与 `pnpm -C ui test` 通过。

## Implementation

- `AGENTS.md` 新增「国际化（i18n）」章节：用户可见文案必须走翻译键；新增/修改文案必须同步 zh-CN 与 en 并保持键结构一致；枚举/状态/来源用键映射；用户内容与后端数据不翻译，确需保留的中文字面量用 `i18n-allow` 注释豁免；变更后必须跑 `pnpm -C ui test` 与 `archkit inspect .`。
- 新增自定义门禁 `quality-gates/gates/ui-i18n.js`，导出异步 `check(projectRoot)`，由 `quality-gates/run.js` 与 `archkit inspect .` 自动发现并执行：
  - 解析 zh-CN / en 各命名空间默认导出对象（排除 `index.ts`），展开全路径键集合并双向比对，分别报告 `en 缺少词条` / `zh-CN 缺少词条`；
  - 遍历 en 资源字符串值，检出中文残留（放行语言名 `简体中文`）；
  - 扫描 `ui/src/components` 与 `ui/src/pages` 的 `.ts/.tsx`（排除测试），剥离块注释与行注释后检测中文；同一行的原文含 `i18n-allow` 则豁免。
- `ui/src/pages/workbench.tsx` 的用户数据显示名加 `// i18n-allow: 用户数据显示名，不翻译（US-13.4）` 豁免。
- 未改动官方 generic 层门禁，未执行 `inspect --sync`。

## Verification

- 负例验证（临时探针，验证后删除，未提交）：`archkit inspect .` 同时报出三类问题 —— `[ui-i18n] zh-CN 缺少词条 extraOnlyInEn`、`[ui-i18n] ui/src/i18n/locales/en/__gate_probe.ts 存在未翻译中文：probe = 中文残留`、`[ui-i18n] ui/src/pages/__gate_probe.ts:1 存在硬编码界面文案…`。
- 清理探针后 `archkit inspect .` → `Quality gates passed.`
- `pnpm -C ui exec vitest run` → 5 个文件 / 34 个用例全部通过。
- `pnpm -C ui build` → 成功（build-exit: 0）。
- `pnpm -C ui exec oxlint` → 0 warnings / 0 errors（83 个文件）。
- 工作区在验证后恢复干净（无探针残留）。

## Related ADRs

- None.
