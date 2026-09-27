---
id: 367f5
status: closed
created_at: 2026-09-27T02:54:56.076Z
updated_at: 2026-09-27T03:04:08.944Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 设计哲学
started_at: 2026-09-27T02:55:03.217Z
closed_at: 2026-09-27T03:04:08.944Z
---

# 实现界面国际化（zh-CN 与 en）

## Background

US-13.4 要求求职者可切换界面语言并持久化；US-1.6 要求首页问候随语言国际化。当前 UI 全部为硬编码中文，依赖已安装 i18next / react-i18next 但未接入，无法满足多语言要求。

## Scope

- 接入 i18next + react-i18next，建立 `ui/src/i18n/` 资源目录与 zh-CN / en 两套翻译资源。
- 语言检测（本地持久化 → 浏览器语言 → zh-CN 兜底）、切换、持久化，并同步 `<html lang>` 与文档标题。
- 设置页「个人偏好」提供语言选择控件（US-13.4 切换入口）。
- 全站界面文案（导航、页面标题、按钮、状态块、徽标、Diff、PendingAction、设置、工作台）改为翻译键渲染。
- 领域内容（简历正文、JD 正文、Profile 事实、模板名、PAT 与访问日志内容）保持原语言不变，符合 US-13.4 第二场景。

## Non-goals

- 不接入语言以外的主题/时区偏好持久化。
- 不新增第三种语言，不引入后端语言协商。
- 不翻译 `ui/src/lib/content.ts` 中的演示领域数据。

## Acceptance Criteria

- [x] i18next 在应用启动时初始化，zh-CN 与 en 资源完整，缺失键回退 zh-CN。
- [x] 语言选择持久化到 localStorage，刷新后保持，并同步 `html[lang]` 与 document.title。
- [x] 设置页可切换语言，切换后全站界面文案与首页问候立即切换。
- [x] 界面组件不再硬编码用户可见文案（导航/页头/按钮/状态/空态/错误态）。
- [x] 领域正文（简历内容、JD 正文、事实内容、Diff 原文）不随语言变化。
- [x] `pnpm -C ui build`、`pnpm -C ui test`、`archkit inspect .` 全部通过。

## Implementation

- 新增 `ui/src/i18n/index.ts`：内置双语资源、`initAsync: false` 同步初始化；导出 `SUPPORTED_LOCALES`、`detectLocale`、`currentLocale`、`changeLocale`；监听 `languageChanged` 同步 `html[lang]` 与 `document.title`；`App.tsx` 副作用导入该模块。
- 语言检测顺序：`localStorage`（键 `resumate.locale`）→ 浏览器语言 → `zh-CN` 兜底；切换即写入 localStorage。
- 资源按命名空间拆分：`common`、`nav`、`settings`、`workbench`、`resume`、`jd`、`profile`、`templates`、`api`，zh-CN / en 各一份，键结构完全一致。
- 全站迁移到 `useTranslation()` + `t()`：应用外壳与导航、设置（含语言切换控件）、kit 状态块/徽标/Diff/PendingAction/版本时间线、简历域、JD 域、Profile 域、模板与工作台、mock 解析返回文案（`lib/api.ts` 与 `lib/api-client.ts` 使用 i18n 单例）。
- 语言选择入口位于设置页「个人偏好」，复用 SCR-010 既有分段控件视觉（未新增页面视觉规则，原型待补状态已记入 `.freak`）。
- 领域正文保持原语言：`lib/content.ts` 的简历/JD/事实/模板/令牌数据、Diff before/after、Agent 消息原文均不改写。
- 新增测试：`ui/src/i18n/i18n.test.ts`（切换、持久化、文档同步、键结构、内容不变）与 `ui/src/i18n/keys.test.ts`（源码字面量键与动态键前缀在两种语言中均可解析）。
- 文档：`ui/README.md` 增补 i18n 说明；`docs/design.md` 增补前端 i18n 关键决策；`ui/src/test-setup.ts` 固定测试语言为 zh-CN。

## Verification

- `pnpm -C ui exec tsc -p tsconfig.app.json --noEmit --incremental false` → 通过（无输出）。
- `pnpm -C ui build` → 成功（`tsc -b && vite build`，生成 dist 产物）。
- `pnpm -C ui exec vitest run` → 5 个文件 / 34 个用例全部通过。
- `pnpm -C ui exec oxlint` → 0 warnings / 0 errors（83 个文件）。
- `archkit inspect .` → `Quality gates passed.`
- 额外核对：`ui/src` 中除注释与用户数据（`workbench.tsx` 的 `USER_DISPLAY_NAME`）外无硬编码中文界面文案；`PageNotFound target=` 残留 0 处；en 资源无未翻译中文（仅语言名 `简体中文` 保留）。

## Related ADRs

- None.
