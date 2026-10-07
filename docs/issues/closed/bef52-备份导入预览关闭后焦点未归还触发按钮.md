---
id: bef52
status: closed
created_at: 2026-10-07T11:22:47.279Z
updated_at: 2026-10-07T11:25:53.792Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 界面与交互
started_at: 2026-10-07T11:23:11.170Z
closed_at: 2026-10-07T11:25:53.792Z
---

# 备份导入预览关闭后焦点未归还触发按钮

## Background

ccd4c（备份导入弹窗模态化）合并到 main 后，合并后端到端实证（无头 Playwright，zh-CN，localhost:5173）发现 AC#1 的「关闭后焦点回到触发按钮」在真机不成立：

- 触发按钮「选择备份文件并校验」在 `previewMutation.isPending` 期间带 `disabled`。用户选文件后请求挂起，按钮变 `disabled`，浏览器把焦点从按钮移到 `document.body`；请求返回后 Modal 才打开，Base UI 记录「打开前焦点元素」时拿到的是 body，关闭时无处可归还。
- Playwright 实测：`change` 事件时 `document.activeElement` 是 BUTTON；弹窗打开后焦点进入弹窗；Esc 关闭后 `document.activeElement` 是 BODY，而非触发按钮。同原语的 PAT 弹窗（触发按钮不 disabled）关闭后焦点正确回到按钮（实测 True），说明原语本身无问题，问题在触发元素中途失焦。
- 现有 `backup-panel.test.tsx` 的焦点归还用例先 `trigger.focus()` 再触发导入，未覆盖「打开前触发元素已失焦」这一真实场景，因此在 jsdom 里一直是绿的。

## Scope

- `ui/src/components/ui/modal.tsx`：补 `finalFocus` 透传（对应 Base UI `Dialog.Popup.finalFocus`），允许调用方显式指定关闭后的焦点落点。
- `ui/src/components/backup-panel.tsx`：给「选择备份文件并校验」按钮加 ref，经 `ImportModal` 传给 `Modal` 的 `finalFocus`。
- `ui/src/components/backup-panel.test.tsx`：先加会失败的用例——打开弹窗前让触发按钮失焦（`document.activeElement === document.body`），关闭后断言焦点回到按钮。

## Non-goals

- 不改变触发按钮的 `disabled` 语义与「读取文件…」加载态。
- 不改后端、不改数据库模型配置。
- 不改 PAT / 生成简历等其它弹窗（它们的触发元素在打开前不失焦）。
- 不引入额外兼容分支。

## Acceptance Criteria

- [x] 触发按钮在打开弹窗前失焦（`document.activeElement === document.body`）时，导入预览关闭后焦点仍回到该按钮。
- [x] `pnpm -C ui test` 全绿、`pnpm -C ui build` 成功、`archkit inspect .` 通过。
- [x] 真机无头 Playwright：选文件触发预览（请求期间按钮 disabled）→ 打开弹窗 → Esc 关闭后焦点回到「选择备份文件并校验」按钮。

## Implementation

- `ui/src/components/ui/modal.tsx`：新增 `finalFocus` prop 并透传给 Base UI `Dialog.Popup.finalFocus`；头注释补「触发元素在打开前会失焦时必须显式传入」。
- `ui/src/components/backup-panel.tsx`：`BackupPanel` 的「选择备份文件并校验」按钮加 `triggerRef`，经 `ImportModal` 传给 `Modal` 的 `finalFocus`；按钮的 `disabled` 语义与「读取文件…」加载态不变。
- `ui/src/components/backup-panel.test.tsx`：新增回归用例——先 `trigger.focus()` 再 `trigger.blur()`（模拟请求期间 disabled 导致浏览器把焦点移到 body），打开导入预览后 Esc 关闭，断言焦点回到触发按钮。
- `README.md`：ui 测试计数同步为 47 files / 365 passed。

## Verification

TDD Red（实现前）：

```text
pnpm -C ui exec vitest run src/components/backup-panel.test.tsx
→ 1 failed | 7 passed
   × 触发按钮在打开前失焦（模拟请求期间 disabled）时，关闭后仍把焦点归还它
     （waitFor(() => expect(trigger).toHaveFocus()) 超时；关闭后 activeElement 仍是 body）
```

Green（实现后，main 工作区）：

```text
pnpm -C ui exec vitest run src/components/backup-panel.test.tsx → 8 passed
pnpm -C ui test   → 47 files, 365 passed
pnpm -C ui build  → exit 0
archkit inspect . → Quality gates passed.
```

真机无头 Playwright（实现提交 `0e7158c` 后，zh-CN，localhost:5173，storage state `/tmp/rsm_state.json`，25/25 通过）：

```text
PASS 关闭后焦点精确归还触发按钮（disabled 场景） | activeElement: BUTTON/选择备份文件并校验
PASS 关闭后背景 inert 已移除
PASS 新增资源显示中文「个人资料/简历/岗位」，不直出 Profile/Resume/JD
PASS bindingRestores 为空时不渲染区块
PASS 422 显后端业务原文 / 500 不泄漏原始报错
PASS Tab/Shift+Tab 不逃逸、Esc 关闭、背景 inert
PASS 生成简历弹窗 Esc 关闭 + 焦点锁定
PASS 无页面未捕获异常
截图：/tmp/ccd4c_e2e_import_preview.png、/tmp/ccd4c_e2e_validation_message.png、/tmp/ccd4c_e2e_create_resume_modal.png
```

## Related ADRs

- None.
