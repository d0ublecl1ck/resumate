---
id: b4cd1
status: closed
created_at: 2026-10-03T06:44:51.840Z
updated_at: 2026-10-03T07:05:55.988Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-10-03T06:45:04.904Z
closed_at: 2026-10-03T07:05:55.988Z
---

# 新建简历收敛为复制与完全新开两条链路并接线复制入口

## Background

SCR-101 新建简历弹窗当前提供三种创建方式（表单 / 对话 / Profile）：其中「对话创建」「Profile 生成」后端 Agent 链路未接入，点击只提示未接入；表单创建要求先填标题、岗位、模板。对「先把简历建出来」这个首要目标，这三种方式都是阻碍。

后端已提供 `POST /resumes/{id}/duplicate`（复制整份文档、标题变「原标题（副本）」），但前端从未调用；`ui/src/components/resume-library.tsx` 的「复制」按钮没有 onClick，是既有的功能缺口。

本工单把新建简历收敛为两条链路：从现有简历复制、完全新开空稿，并把复制入口接线。

## Scope

- 原型：在 `ui/prototypes/index.html` 注册新版 SCR-101 两步流程（第一步选链路、第二步大弹层网格选简历）、无简历 / 无模板态，并同步 SCR-101 收敛后的定义。
- `ui/src/components/create-resume-modal.tsx`：移除「对话创建」「Profile 生成」；只剩「从现有简历复制」「完全新开」两条链路，不再要求标题 / 岗位 / 模板，也不再放来源下拉。
- 完全新开：前端补默认值（标题取默认文案、模板取首个已发布模板），`POST /resumes` 传空文档，成功后跳转编辑器。
- 从现有简历复制：两步。第一步点「创建」不产生任何资源，切换到第二步 `ResumePickerDialog`；第二步用网格卡片列出活跃简历，选定后点「创建副本」才调用 `POST /resumes/{id}/duplicate`。无活跃简历时该链路不可选并说明原因。
- `ui/src/components/resume-picker-dialog.tsx`（新）：第二步的选择层，纯选择组件，不发请求。
- `ui/src/lib/api.ts`：新增 `duplicateResume(id)`。
- `ui/src/components/resume-library.tsx`：接上列表行的「复制」按钮（同一 `duplicateResume`，成功后刷新列表并进入副本）。
- 文档：同步更新 SCR-101 与 US-1.11。
- i18n：zh-CN / en 同步补齐与删除词条，默认标题也走翻译键。

## Non-goals

- 不做「创建后用 Profile 预填充」对话框：Profile 选材生成在 `docs/agent/agent-operation-api.md` 明确列为后续工单，且 profile 作用域 run 按契约无法访问任何简历（§21.3），该对话框会在界面上留下无法完成的动作。是否改成「有入口、动作待接入」由用户另行决定，确认后另开工单。
- 不改后端 `POST /resumes` 与 `POST /resumes/{id}/duplicate` 的契约。
- 不动 JD 的「复制后微调」链路。

## Acceptance Criteria

- [x] 新建简历弹窗只有两条链路，且不再出现标题 / 岗位 / 模板输入与来源下拉。
- [x] 复制链路第一步点「创建」不产生任何资源，只切换到第二步选择层。
- [x] 第二步用网格卡片列出活跃简历（归档不列），选中后点「创建副本」才调用 `POST /resumes/{id}/duplicate`。
- [x] 第二步取消回到第一步，且不创建资源；复制失败留在第二步可重试。
- [x] 完全新开走 `POST /resumes`，标题与模板取默认值，创建成功跳转编辑器。
- [x] 从现有简历复制产出独立简历并跳转。
- [x] 无活跃简历时复制链路不可选并给出原因；无已发布模板时完全新开不可提交并给出原因。
- [x] 简历库列表「复制」按钮可用，且行为与弹窗复制一致。
- [x] SCR-101 与 US-1.11 已同步。
- [x] `pnpm -C ui test`、`pnpm -C ui build`、`pnpm -C ui build-storybook`、`archkit inspect .` 通过。

## Implementation

- `ui/src/components/create-resume-modal.tsx`：重写为两条链路。移除对话创建 / Profile 生成与标题、岗位、模板、JD 输入，也不再有来源下拉；props 由 `jds` 换成 `resumes`；复制链路点「创建」只切换到第二步选择层，不产生资源；完全新开用默认标题 + 首个已发布模板并提交空文档；链路不可用时回退到另一条并在弹窗内写明原因；关闭时复位内部步骤与选中态。
- `ui/src/components/resume-picker-dialog.tsx`（新）：第二步选择层。`max-w-5xl` 大弹层，`sm:grid-cols-2 lg:grid-cols-3` 网格卡片列出活跃简历（标题、保存状态、岗位方向、标签、模板 rev、上次编辑），选中卡片 cobalt 高亮，点「创建副本」回调；纯选择组件，不发请求。
- `ui/src/lib/api.ts`：新增 `duplicateResume(id)`（`POST /resumes/{id}/duplicate`）。
- `ui/src/lib/resume-create.ts`：新增 `resumeCreateErrorMessage`，把机器错误码映射到 i18n 文案（含复制来源已不存在的 404），弹窗与列表共用。
- `ui/src/components/resume-library.tsx`：接上列表行「复制」按钮（此前无 onClick），与弹窗共用同一接口；成功后失效简历查询并进入副本，失败就地展示 i18n 文案。
- i18n：`resume.create` 在 zh-CN / en 同步收敛为两条链路，删除表单 / 对话 / Profile 与来源下拉词条，新增 `noSource`、`noTemplate`、`defaultTitle`、`copyPick.*`、`errors.sourceMissing`。
- 原型：`ui/prototypes/index.html` 新增「设计补充 · SCR-101 新建简历（复制 / 完全新开）」，含两步视觉（第一步选链路、第二步大弹层网格选简历）与边界态登记。
- 文档：SCR-101 重写（Purpose / Journeys / Features / Actions / States / Constraints / Next Target，含两步与选择层约束）、US-1.11 重写为四条 Scenario（复制场景拆成两步）、UJ-D02 覆盖行与 `Q-01` 标注创建入口后置、US-1.1 增加入口后置说明。
- 测试与 story：`create-resume-modal.test.tsx` 重写为 13 条（两步流程、选择层取消、边界态、错误码映射、App 级跳转）、新增 `resume-library.test.tsx` 2 条、`resume-picker-dialog.stories.test.tsx` 4 条、`create-resume-modal.stories.test.tsx` 4 条，以及 `create-resume-modal.stories.tsx` / `resume-picker-dialog.stories.tsx` 共 7 个 story。
- `ui/src/index.css.test.ts` 改为按工作目录读取样式表（`process.cwd()` + `node:fs`），避免 `tsc -b` 因缺少 node 类型而失败。

## Verification

- `pnpm -C ui test` → `Test Files 34 passed (34)`，`Tests 252 passed (252)`。
- `pnpm -C ui build` → `✓ built`（含 `tsc -b` 类型检查）。
- `pnpm -C ui build-storybook` → `Storybook build completed successfully`。
- `pnpm -C ui lint` → `Found 9 warnings and 0 errors`（改动前同为 9 条，均不在本工单改动的文件内）。
- `archkit inspect .` → `Quality gates passed.`
- Storybook 确认件：`Components/CreateResumeModal`（default / no-source-resume / no-published-template）与 `Components/ResumePickerDialog`（default / empty / submitting / failed）。

## Related ADRs

- None.
