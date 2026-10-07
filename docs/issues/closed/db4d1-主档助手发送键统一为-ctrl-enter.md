---
id: db4d1
status: closed
created_at: 2026-10-07T11:01:31.477Z
updated_at: 2026-10-07T11:12:02.026Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-07T11:01:52.811Z
closed_at: 2026-10-07T11:12:02.026Z
---

# 主档助手发送键统一为 ⌘/Ctrl+Enter

## Background

两个 Agent 输入框的发送键约定不一致：

- `ui/src/components/run-panel.tsx:156-160`（简历编辑页）已是「⌘/Ctrl+Enter 发送」：`e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && e.keyCode !== 229`，裸 Enter 与 Shift+Enter 都换行。
- `ui/src/components/profile-assistant.tsx`（主档助手）还是「裸 Enter 发送」：`e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229`。

用户决定统一到 RunPanel 的约定：**主档助手也改成 ⌘/Ctrl+Enter 发送，裸 Enter 换行（Shift+Enter 同样换行）**，并保持 IME 组合态不误发。

同时，主档助手的 placeholder 文案与行为绑定：`profile.assistant.placeholder` 现在写「…（Enter 发送，Shift+Enter 换行）」/ en `(Enter to send, Shift+Enter for a new line)`，改行为后必须同步成与 RunPanel 一致的措辞（workbench `inputPlaceholder` 用「（⌘↵ 发送）」/ `(⌘↵ to send)`），zh-CN 与 en 键结构保持一致。

## Scope

- `ui/src/components/profile-assistant.tsx`：输入框 `onKeyDown` 改为 `e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && e.keyCode !== 229`；裸 Enter 不再 `preventDefault`、不再发送，交由 textarea 换行。
- `ui/src/components/profile-assistant.test.tsx`：按 TDD 先加键盘用例——裸 Enter 不发送且插入换行、⌘/Ctrl+Enter 发送、IME 组合态不发送。
- `ui/src/i18n/locales/zh-CN/profile.ts` 与 `ui/src/i18n/locales/en/profile.ts`：`assistant.placeholder` 改成与 RunPanel 同措辞，保留按键提示。
- 若是 Storybook / 原型登记了该输入框的快捷键说明，同步更新（本工单不新增视觉）。

## Non-goals

- 不改 `ui/src/components/run-panel.tsx` 的发送键约定。
- 不改发送按钮的 `type` / 表单提交逻辑（点击按钮仍可发送）。
- 不改 workbench `inputPlaceholder` 等既有文案。
- 不新增全局快捷键或设置项。

## Acceptance Criteria

- [x] 在输入框按裸 Enter：不触发发送、不触发表单提交，文本插入一个换行。
- [x] 在输入框按 Shift+Enter：行为与裸 Enter 相同（换行，不发送）。
- [x] 在输入框按 Meta+Enter 或 Ctrl+Enter：触发一次发送（与点击发送按钮等价）。
- [x] IME 组合态下按 Enter / Meta+Enter / Ctrl+Enter 不发送（`isComposing` 与 `keyCode === 229` 都被守住）。
- [x] `profile.assistant.placeholder` 的 zh-CN 与 en 都与 RunPanel 的按键措辞一致（zh 含「⌘↵ 发送」、en 含 `⌘↵ to send`），且键结构不变。
- [x] `pnpm -C ui test`、`pnpm -C ui run build`、`archkit inspect .` 通过。
- [x] 无头浏览器在 `http://localhost:5173/profile` 实测：输入文字后裸按 Enter 不发送且保留换行，按 Ctrl/Meta+Enter 才发送。

## Implementation

- `ui/src/components/profile-assistant.tsx`：输入框 `onKeyDown` 条件由 `e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229` 改为 `e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && e.keyCode !== 229`，与 `run-panel.tsx:156-160` 完全同约定；裸 Enter / Shift+Enter 不再拦截，交由 textarea 换行。保留 `e.preventDefault()`，避免发送瞬间插入多余换行。
- `ui/src/components/profile-assistant.test.tsx`：新增 `ProfileAssistant 的发送键约定（与 RunPanel 统一）` 5 条用例（Shift+Enter 只换行、Meta+Enter 发送、Ctrl+Enter 发送、IME 组合态不发送、裸 Enter 不发送且不拦截默认换行）；用例各自持有独立调用记录，裸 Enter 用例排最后避免在途请求污染否定断言。
- `ui/src/i18n/locales/zh-CN/profile.ts` / `ui/src/i18n/locales/en/profile.ts`：`assistant.placeholder` 的按键提示由「Enter 发送，Shift+Enter 换行」改为「⌘↵ 发送，Shift+↵ 换行」/ `(⌘↵ to send, Shift+↵ for a new line)`，zh-CN 与 en 键结构一致。

## Verification

TDD Red（实现前）：`pnpm -C ui exec vitest run src/components/profile-assistant.test.tsx`

```text
 FAIL  src/components/profile-assistant.test.tsx > ProfileAssistant 的发送键约定（与 RunPanel 统一） > 裸 Enter 不发送、不拦截默认换行
AssertionError: expected true to be false // Object.is equality
- Expected: false
+ Received: true
 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
```

TDD Green（实现后）：同命令 `Test Files 1 passed (1)`、`Tests 17 passed (17)`。

### 合并后验证（2026-10-07）

- 分支 `chore/profile-scope-issues-and-enter-send` 先 `git rebase main`（main 已前进到 `c8150e0`），`.freak` 手工合并两侧线索后继续；`git merge --ff-only` 合入 main，main HEAD = `994ae65`。
- `pnpm -C ui test` → `Test Files 42 passed (42)`、`Tests 313 passed (313)`。
- `pnpm -C ui run build` → `✓ built`（含 `tsc -b` 类型检查）。
- `archkit inspect .` → `Quality gates passed.`
- 无头浏览器（Playwright chromium headless，`locale=zh-CN`，复用 `/tmp/rsm_state.json`）：打开 `http://localhost:5173/profile` →「对话维护资料」，实测结果：

```json
{
  "placeholder": "改基本信息，或补充一段经历…（⌘↵ 发送，Shift+↵ 换行）",
  "placeholderHasCmdEnter": true,
  "valueAfterEnter": "E2E裸Enter断言-保留换行\n",
  "bareEnterKeptNewline": true,
  "bareEnterNotSent": true,
  "ctrlEnterClearedInput": true,
  "ctrlEnterTriggeredRun": true,
  "valueAfterCtrlEnter": "",
  "consoleErrors": []
}
ASSERTIONS_PASSED=True
```

截图：`/tmp/rsm_profile_assistant_enter.png`。发送产生的 run 请求只有 Ctrl+Enter 触发的那一次（`POST /api/sessions/sess_6d3cf19b4923/runs`），控制台无 error。

## Related ADRs

- `ui/src/components/run-panel.tsx:156-160`（统一的发送键约定）
