---
id: cff1e
status: closed
created_at: 2026-10-07T10:43:22.170Z
updated_at: 2026-10-07T10:52:51.814Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 界面与交互
started_at: 2026-10-07T10:43:38.288Z
closed_at: 2026-10-07T10:52:51.814Z
---

# 设置与开放接入面板错误态、用途本地化与模态焦点管理

## Background

测试报告在 `/settings` 与 `/settings/access` 两个面板上一共记录 7 个缺陷，每一条都有可复现证据：

1. **[重要] `/settings` 任一初始查询失败 -> 整页白屏。** `ui/src/pages/settings.tsx:14` 只判 `isPending`，`:16` 用 `agent.data!` 强断言，缺 `isError` 分支；Playwright 拦截 `**/api/agent/config`（或 `/api/settings`、`/api/templates`、`/api/models/config`）返回 500 后 body 为空，未捕获异常 `Cannot read properties of undefined (reading 'nextRunMode')`。对照 `/api/models/catalog` 失败是优雅降级。
2. **[轻微] 英文界面「测试连接」结果仍是中文「连接成功」。** `ui/src/components/settings-form.tsx:426` 直接渲染 `testResult.message`，后端 `backend/app/modules/settings/catalog.py:246` 硬编码 `连接成功`；locale 已存在 `settings.model.connectionOk` 却从未被使用。
3. **[轻微] 中文文案混入内部实现名/开发术语。** `ui/src/i18n/locales/zh-CN/settings.ts:80` 的 `themeHint` 含组件名 `ThemeSync`；`:94` 的 `shortcutAction.save_flush` 含开发术语 `保存 / flush`。
4. **[轻微] 「默认模板」下拉没有可访问名称。** `ui/src/components/settings-form.tsx:526-545` 用 `<span>`（`FieldLabel`）当标签而不是 `<label>`，也无 `aria-label`；无障碍名退化成选项文本拼接。
5. **[重要] `/settings/access` 访问日志「用途」列直出英文枚举。** `ui/src/components/access-panel.tsx:131` 用 `t("settings.accessLog.purposeValue." + log.purpose, { defaultValue: log.purpose })`，但 `purposeValue` 只映射 `token_create`/`token_revoke`；后端 `backend/app/modules/auth/deps.py:25-30` 还会产出 `pat_auth`、`pat_scope`、`pat_human_session`、`run_token_auth`、`run_token_scope`、`run_human_session`（实测 59 行全是 `run_token_scope`）。
6. **[轻微] `/settings/access` 窄屏横向溢出。** viewport 390px 时 `html.scrollWidth=395 > 390`，「公共接入能力」三个 URL 卡片溢出容器、右边框被裁；根因是 `ui/src/components/access-panel.tsx:52` 的 `<dl class="grid gap-2 sm:grid-cols-3">` 单列隐式 auto 轨道被 `truncate`（nowrap）的 URL 撑开，`CopyField` 缺 `min-w-0`。
7. **[重要 · a11y] 模态对话框缺焦点管理。** `/settings/access` 的「创建访问令牌」弹窗打开后焦点仍在触发按钮；Tab 会离开 `[role=dialog]`（无焦点陷阱）；Esc 不关闭；关闭后焦点落到 body；背景无 `inert`/`aria-hidden`。仓库内 `version-history.tsx`、`backup-panel.tsx`、`create-resume-modal.tsx`、`create-jd-modal.tsx`、`resume-picker-dialog.tsx` 各写一套模态，均无焦点管理。

## Scope

- **错误态**：`ui/src/pages/settings.tsx` 对四个查询（`agent-config` / `model-config` / `preferences` / `templates`）补 `isError` 分支，渲染 `StateBlock kind="error"`（错误码 + 重试按钮），不再白屏；复用 `ui/src/components/kit/state-block.tsx` 的六态语义。
- **连接结果 i18n**：`ui/src/components/settings-form.tsx` 成功态走 `t("settings.model.connectionOk")`，失败态继续显示后端 `testResult.message`（业务原文不翻译）；不改后端文案体系。
- **中文措辞**：`ui/src/i18n/locales/zh-CN/settings.ts` 与 `en/settings.ts` 同步改写 `themeHint`、`shortcutAction.save_flush`，键结构保持一致。
- **可访问名**：`ui/src/components/settings-form.tsx` 「默认模板」select 补正确可访问名，与「主题」select 的写法对齐。
- **用途本地化**：`ui/src/i18n/locales/{zh-CN,en}/settings.ts` 的 `accessLog.purposeValue` 补齐全部 8 个已知 purpose（6 个后端认证常量 + `token_create`/`token_revoke`）；未知值保留 `defaultValue` 兜底。
- **窄屏**：`ui/src/components/access-panel.tsx` 的 `CopyField` 与 `dl` 网格补 `min-w-0`，390/768/1024/1440 无横向溢出。
- **模态原语**：新增可复用的 `ui/src/components/ui/modal.tsx`（包 `@base-ui/react/dialog`，提供焦点入弹窗 / Tab 陷阱 / Esc 关闭 / 焦点归还触发元素 / 背景 inert），先用它改造 `access-panel.tsx` 的 PAT 弹窗；接口保持干净，供下一批 backup 导入弹窗与简历库生成简历弹窗复用。
- **测试**：为上述每条先写失败的 vitest 用例，再改实现；新增 purpose 词条守卫测试（校验每个后端 purpose 常量都有 zh/en 词条）。
- 需要时同步 `ui/prototypes/index.html` 的对应屏状态说明。

## Non-goals

- 「开始聊聊」CTA 行为、backup 死按钮与文案决策、自动保存越界提示、access 的 PAT 空态/日志分页筛选/权限态——用户尚未拍板，本批不动。
- backup 面板与 `/profile` 的问题不动。
- 不改 `backend/` 行为、不改数据库模型配置；access 面板其余加载失败分支不在本次七条之内，不动。
- 不引入新的视觉模式：错误态沿用 `StateBlock`，弹窗沿用既有 `card-frame` + 遮罩。

## Acceptance Criteria

- [x] 拦截 `/api/agent/config`（或其余三个初始查询）返回 500 时 `/settings` 渲染错误状态块（错误码 + 重试按钮），无白屏、无未捕获异常。
- [x] `locale=en-US` 下「测试连接」成功态显示 `Connected`；业务失败态仍显示后端返回原文。
- [x] zh/en 的 `themeHint` 与 `shortcutAction.save_flush` 不再出现 `ThemeSync` / `flush`；键结构一致。
- [x] 「默认模板」select 具备可访问名 `默认模板`（`getByRole("combobox", { name })` 可命中）。
- [x] `accessLog.purposeValue` 覆盖全部后端 purpose 常量；未知 purpose 回退显示原值而非裸键名；新增测试守住该契约。
- [x] `/settings/access` 在 390/768/1024/1440 宽度下 `scrollWidth === clientWidth`。
- [x] PAT 弹窗：打开即焦点在弹窗内、Tab/Shift+Tab 不逃逸、Esc 关闭、关闭后焦点回到触发按钮、背景有 `inert`。
- [x] `pnpm -C ui test` 全绿、`pnpm -C ui build` 成功、仓库根 `archkit inspect .` 通过。

## Implementation

- `ui/src/pages/settings.tsx`：四个查询都参与 `isError` 判定，任一失败渲染 `StateBlock kind="error"`（`ApiRequestError.code` 作为错误码 + 「重试」按钮，点击 refetch 四个查询），不再强断言 `data`。
- `ui/src/components/settings-form.tsx`：连接测试成功态渲染 `t("settings.model.connectionOk")`，业务失败态继续渲染 `testResult.message`；「默认模板」select 外层由 `div` 改为 `label` 并补 `aria-label`。
- `ui/src/components/ui/modal.tsx`（新增）：包 `@base-ui/react/dialog` 的可复用模态原语。Base UI 负责焦点陷阱、Esc 关闭、焦点归还与背景 `aria-hidden`；原语再补一层 `inert`（遍历 body 直接子节点，跳过 portal host），并因 portal 挂载晚于 `open` 而用回调节点做 effect 依赖。
- `ui/src/components/access-panel.tsx`：PAT 弹窗改用 `Modal`（常驻挂载 + `open` 控制，关闭后清空草稿）；`CopyField` 与能力 `dl` 网格补 `min-w-0`。
- `ui/src/i18n/locales/{zh-CN,en}/settings.ts`：新增 `loadError.*`；`accessLog.purposeValue` 补齐 8 个 purpose；改写 `preferences.themeHint` 与 `shortcutAction.save_flush`。`common.ts` 新增 `actions.retry`。
- 测试：`ui/src/pages/settings.test.tsx`（新增）、`ui/src/components/settings-form.test.tsx`（扩）、`ui/src/components/settings-form.stories.test.tsx`（同步）、`ui/src/i18n/settings-wording.test.ts`（新增）、`ui/src/components/access-panel.test.tsx`（新增）、`ui/src/i18n/access-purpose.test.ts`（新增，读后端源码守 purpose 词条）。
- 原型 `ui/prototypes/index.html` 的 `#screen-settings` 补状态说明；`.freak` 补 Modal 原语与 purpose 守卫线索。

## Verification

TDD Red（实现前）：

```text
pnpm -C ui exec vitest run src/pages/settings.test.tsx
→ 5 failed：Cannot read properties of undefined (reading 'nextRunMode')

pnpm -C ui exec vitest run src/components/settings-form.test.tsx src/i18n/settings-wording.test.ts
→ 7 failed | 11 passed（成功态仍出后端中文、默认模板无可访问名、ThemeSync/flush 未改）

pnpm -C ui exec vitest run src/components/access-panel.test.tsx src/i18n/access-purpose.test.ts
→ 5 failed | 1 passed（purpose 出英文枚举、弹窗无焦点管理/无 inert）
```

Green（实现后，worktree `fix/settings-access-a11y`）：

```text
pnpm -C ui test   → 42 files, 305 passed（基线 38 files / 287 passed）
pnpm -C ui build  → built in ~0.5s
archkit inspect . → Quality gates passed.
```

合并后端到端实证（合并到 main `e481d09` 后，无头 Playwright 1.57.0 打 5173，storage state `/tmp/rsm_state.json`，20/20 断言通过）：

```text
PASS 设置错误块：拦截 **/api/agent/config 500 → role=alert「设置加载失败 / 错误码：INTERNAL_ERROR / 重试」，body 非空
     /tmp/rsm_e2e_settings_error.png
PASS 用途列：首行「用途」= 运行令牌权限校验，表格内不再出现 run_token_scope
PASS 窄屏：390/768/1024/1440 scrollWidth === clientWidth
     /tmp/rsm_e2e_access_390.png
PASS PAT 弹窗：打开即焦点在弹窗内、背景 inert、Tab 与 Shift+Tab 不逃逸、
     Esc 关闭、焦点回到触发按钮、关闭后 inert 移除
     /tmp/rsm_e2e_pat_modal.png
PASS en-US：拦截 /api/models/config:test 返回 ok=true 后点「Test connection」显示 Connected，
     body 不含「连接成功」
     /tmp/rsm_e2e_en_connected.png
```

注：E2E 在每次 Tab 后等 40ms 再断言——Base UI 的焦点守卫会在同一帧内把焦点移回弹窗，立即采样会读到守卫元素（非用户可见状态）；加上缓冲后 12 次 Tab 与 4 次 Shift+Tab 全部停留在 `[role=dialog]` 内。

## Related ADRs

- None.
