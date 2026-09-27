---
id: dae41
status: closed
created_at: 2026-09-27T02:23:00.463Z
updated_at: 2026-09-27T02:23:57.666Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-09-27T02:23:06.097Z
closed_at: 2026-09-27T02:23:57.666Z
---

# 个人资料页对话入口收敛到顶部

## Background

71008 为个人资料页补齐了直接编辑，但同时在基本信息卡、每个分区和每条事实上各放了一个对话入口（对话编辑 / 对话添加 / 对话更新）。对话助手本就能整体维护主档，这些卡片级入口与页头「对话维护资料」重复，也让页面按钮密度过高。对话维护应当是整个 Profile 的一个入口，不是每条卡片各自的入口。

## Scope

- 移除基本信息卡的「对话编辑」、每个分区的「对话添加」、每条事实的「对话更新」。
- 页头「对话维护资料」作为页面唯一的对话入口，保留不变。
- 直接编辑入口全部保留：基本信息「编辑」、每个分区「手动添加」、每条事实「编辑」。
- 清理因卡片级入口移除而不再被调用的 prefill / defaultType 预填机制。

## Non-goals

- 不改变对话助手自身的解析、建议与显式确认流程（C-07）。
- 不改变直接编辑表单的字段、默认值与保存语义。
- 不新增或调整页面视觉规则。

## Acceptance Criteria

- [x] 页头「对话维护资料」是个人资料页唯一的对话入口。
- [x] 基本信息卡、事实分区、事实卡片上不再出现任何对话类按钮。
- [x] 直接编辑入口（编辑基本信息、手动添加、编辑事实）保留且仍可用。
- [x] 组件测试断言唯一对话入口与卡片级对话按钮的缺席；build、test、lint、archkit inspect . 全部通过。

## Implementation

- `profile-workspace.tsx`：删除基本信息卡「对话编辑」、每个分区「对话添加」、每条事实「对话更新」；页头「对话维护资料」改为直接 `setAssistantOpen(true)`，成为唯一对话入口。
- 直接编辑入口保持不变：基本信息「编辑」、每个分区「手动添加」、每条事实「编辑」；事实行的操作区从双按钮收为单按钮。
- `profile-assistant.tsx`：删除不再有调用方的 `prefill` / `defaultType` props，以及对应的输入框预填 useEffect 与新建类型修正分支；对话助手的解析、建议、确认与写入流程不变。
- 测试：`profile-workspace.test.tsx` 把原「保留对话编辑入口」改为「对话入口只在页头，卡片上不重复」，并新增「直接编辑入口保留」。

## Verification

- `pnpm --dir ui test`：25 tests passed（profile-workspace 6 条，含唯一对话入口与卡片级对话按钮缺席断言）。
- `pnpm --dir ui run lint`：0 warnings 0 errors（57 files）。
- `pnpm --dir ui run build`：通过（index.js 468.00 kB / gzip 136.47 kB）。
- `archkit inspect .`：Quality gates passed。
- headless Chrome（1440×1800）实测 /profile 按钮清单：`对话维护资料`×1，`对话编辑`/`对话添加`/`对话更新`×0，`手动添加`×6，事实「编辑」×4，基本信息「编辑」×1。

## Related ADRs

- None.
