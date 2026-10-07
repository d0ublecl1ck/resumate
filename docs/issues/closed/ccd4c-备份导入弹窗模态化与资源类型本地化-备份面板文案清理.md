---
id: ccd4c
status: closed
created_at: 2026-10-07T10:57:06.728Z
updated_at: 2026-10-07T11:17:23.693Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 界面与交互
started_at: 2026-10-07T10:57:18.821Z
closed_at: 2026-10-07T11:17:23.693Z
---

# 备份导入弹窗模态化与资源类型本地化、备份面板文案清理

## Background

上一批 cff1e 已落地可复用模态原语 `ui/src/components/ui/modal.tsx`（焦点入弹窗 / Tab 锁定 / Esc 关闭 / 焦点归还 / 背景 `inert`），并用它改造了 `/settings/access` 的 PAT 弹窗。本批把 `/settings/backup` 与 `/profile` 的两处手写弹窗迁移到该原语，并修掉备份面板的本地化与错误出口问题。每条都有测试或实测证据：

1. **[重要·a11y] 备份「导入预览」弹窗不是真模态。** `ui/src/components/backup-panel.tsx:151-153` 是手写的 `fixed` 遮罩 + `role="dialog"`。实测打开后 `document.activeElement` 仍是 `BODY`；连按 Tab 会跑到背景侧边栏（`inDialog:false`）；按 Escape 不关闭（弹窗数仍为 1）；只能点取消或遮罩关闭。
2. **[重要·i18n] 导入预览直出后端英文枚举。** `ui/src/components/backup-panel.tsx:191` 直接渲染 `{resource.type}`；后端 `backend/app/modules/backup/service.py:257-259` 发 `type="Profile"/"Resume"/"JD"`，`:223/:225/:227/:229/:296/:302` 还会发 `ResumeVersion`/`ProfileFact`。中文界面因此出现 `Profile · 我的职业事实库`、`Resume · …`。
3. **[轻微] 备份格式版本错误只显示通用「校验失败」。** `backup-panel.tsx:112` 只渲染 `settings.backup.importFailed`。上传 `{"formatVersion":"nope","resources":{}}` 时服务端 422 返回 `{"code":"VALIDATION_FAILED","message":"不支持的备份格式版本：'nope'"}`，该业务原文被丢弃。
4. **[轻微] 「绑定关系恢复」空区块常驻。** `backup-panel.tsx:202-214` 无条件渲染标题与空 `ul`；导入 `jds=0` 的备份（默认导出即如此）时标题下只有空白。
5. **[轻微·a11y] 「生成简历」弹窗不支持 Esc。** `ui/src/components/create-resume-modal.tsx:111-113` 同样是手写弹窗，`/profile` → 「生成简历」→ 按 Esc 不关闭，焦点不归还。
6. **[用户拍板·追加] 「下载证据附件」是死按钮。** `backup-panel.tsx:90-92` 无 `onClick`、无端点，决定删除按钮本身与对应 `settings.backup.downloadEvidence` 词条。
7. **[用户拍板·追加] 文案与死词条清理。** `settings.backup.importHint` 承诺了「预览新增资源与 ID 映射」，但真实弹窗只展示新增资源与绑定恢复、不展示 ID 映射；`settings.importModal.attachments` / `movable` / `notExportable` 三个词条全仓库无引用。

## Scope

- **模态迁移**：`ui/src/components/backup-panel.tsx` 的 `ImportModal` 与 `ui/src/components/create-resume-modal.tsx` 改用 `ui/src/components/ui/modal.tsx`，常驻挂载（`<Modal open={...} onOpenChange={...}>`），关闭时清掉草稿（`preview`/`payload` 与 `picking`/`sourceId`/`error`）。
- **资源类型本地化**：新增 `settings.importModal.resourceType.{Profile,Resume,ResumeVersion,JD,ProfileFact}` 的 zh/en 词条，组件用 `t("settings.importModal.resourceType." + resource.type, { defaultValue: resource.type })` 键映射；未知值兜底原值。
- **错误出口**：`backup-panel.tsx` 在预览失败且 `error instanceof ApiRequestError` 时渲染后端业务 `message`（仅 `VALIDATION_FAILED` 一类 4xx 业务校验原文），否则维持通用文案；`5xx` 与网络错误不显示原始报错。
- **空态**：`preview.bindingRestores.length === 0` 时隐藏「绑定关系恢复」区块。
- **文案清理**：删除「下载证据附件」按钮与 `settings.backup.downloadEvidence`；改写 `settings.backup.importHint` 去掉「ID 映射」承诺；删除 `settings.importModal.attachments/movable/notExportable`。
- **i18n 守卫测试**：新增测试解析 `backend/app/modules/backup/service.py` 里的 `BackupNewResource(type="…")` 与 `BackupIdMapping(..., type="…")` 字面量，断言每个后端 type 在 zh-CN / en 都有词条。
- **原型与 `.freak`**：同步 `ui/prototypes/index.html` 的 `#screen-settings` 备份分区说明；`.freak` 补本批线索。
- 需要时同步 `ui/prototypes/index.html` 对应屏。

## Non-goals

- `version-history.tsx`、`create-jd-modal.tsx`、`resume-picker-dialog.tsx` 三处手写弹窗本批不动（已登记 `.freak`）。
- 「确认导入为新资源」链路本身、`backend/` 行为与数据库模型配置不改。
- `/profile` 与 settings 其它问题不动。

## Acceptance Criteria

- [x] 导入预览弹窗打开即焦点在 `[role=dialog]` 内、Tab/Shift+Tab 不逃逸、Esc 关闭、关闭后焦点回到触发按钮、背景有 `inert`。
- [x] 新增资源列表显示中文类型（不再出现 `Profile`/`Resume`/`JD` 原文）；后端每种 `type` 都有 zh/en 词条（测试守住）；未知值兜底原值。
- [x] 上传 `formatVersion=nope` 时界面渲染后端 message「不支持的备份格式版本：'nope'」；5xx 与网络错误不显示原始报错。
- [x] `bindingRestores` 为空时「绑定关系恢复」区块不渲染。
- [x] 「生成简历」弹窗支持 Esc 关闭 + 焦点管理 + 焦点归还。
- [x] 「下载证据附件」按钮与 `settings.backup.downloadEvidence` 词条已删除，全仓库无引用。
- [x] `settings.backup.importHint` 不再承诺「ID 映射」；三个死词条已删；zh/en 键结构一致。
- [x] `pnpm -C ui test` 全绿、`pnpm -C ui build` 成功、仓库根 `archkit inspect .` 通过。

## Implementation

- `ui/src/components/backup-panel.tsx`：删除无 `onClick` 的「下载证据附件」按钮与 `Download` 图标；`ImportModal` 由条件渲染改为常驻 `<Modal open={preview !== null && payload !== null}>`，改用 `ui/src/components/ui/modal.tsx` 原语承担焦点入弹窗 / Tab 锁定 / Esc 关闭 / 背景 `inert`，关闭走 `closePreview()` 同时清空 `preview` 与 `payload`；新增资源类型走 `t("settings.importModal.resourceType." + resource.type, { defaultValue: resource.type })`；`bindingRestores.length === 0` 时整块不渲染；新增 `importErrorMessage()`，仅当 `error instanceof ApiRequestError && 400 ≤ status < 500 && code === "VALIDATION_FAILED"` 时回显后端 `message`（带 `error-message-allow` 与理由），其余回退 `settings.backup.importFailed`。
- `ui/src/components/create-resume-modal.tsx`：去掉 `if (!open) return null`，第一步弹窗改用 `Modal` 原语（`title` / `description` / `onOpenChange`），关闭调 `close()` 复位 `picking` / `sourceId` / `error` / `submitting`；`ResumePickerDialog` 选择层未迁移，仍是既有行为。
- `ui/src/i18n/locales/{zh-CN,en}/settings.ts`：新增 `settings.importModal.resourceType.{Profile,Resume,ResumeVersion,JD,ProfileFact}`；删除 `backup.downloadEvidence` 与 `importModal.attachments/movable/notExportable`；改写 `backup.importHint` 去掉「ID 映射」承诺、改为「预览将新增的资源与绑定关系恢复」；zh 的 `importModal.meta` 把 `Profile` 改「个人资料」，与资源类型措辞一致。
- 测试：新增 `ui/src/components/backup-panel.test.tsx`（资源类型 / 模态焦点契约 / 4xx 与 5xx 错误出口 / 空态 / 死按钮与说明）、`ui/src/i18n/backup-resource-type.test.ts`（读 `backend/app/modules/backup/service.py` 的 `BackupNewResource` / `BackupIdMapping` 字面量守 zh/en 词条）；扩展 `ui/src/components/create-resume-modal.test.tsx` 的模态焦点契约用例。
- `ui/prototypes/index.html`：#screen-resumes 补 SCR-101 弹窗 a11y 状态、#screen-settings 补 SCR-012 文案清理与 SCR-112 导入预览状态。
- `README.md` 同步 ui 测试计数为 44 files / 316 passed；`.freak` 补本批复核线索。

## Verification

TDD Red（实现前：用 `git stash push` 只暂存实现文件、保留新测试与用例，跑新用例）：

```text
pnpm -C ui exec vitest run src/components/backup-panel.test.tsx src/i18n/backup-resource-type.test.ts src/components/create-resume-modal.test.tsx
→ 3 files failed, 8 failed | 15 passed
   × 每个后端资源类型都有 zh-CN 与 en 词条
   × 新增资源显示中文类型，不直出后端枚举
   × 打开后焦点进入弹窗、Tab/Shift+Tab 不逃逸、Esc 关闭并归还焦点、背景 inert
   × 业务校验失败渲染后端 message
   × bindingRestores 为空时不渲染区块
   × 不再渲染已下线的「下载证据附件」死按钮
   × 导入说明不再承诺 ID 映射，改为与弹窗一致的表述
   × 创建简历 Modal：打开后焦点进入弹窗、Tab 不逃逸、Esc 关闭并把焦点归还触发按钮
```

Green（实现后，worktree `fix/settings-backup-modal-i18n`）：

```text
pnpm -C ui test   → 44 files, 316 passed（基线 42 files / 306 passed）
pnpm -C ui build  → built in ~0.4s
archkit inspect . → Quality gates passed.
```

合并后端到端实证（合并到 main 后）：见下方追加记录。

## Related ADRs

- None.
