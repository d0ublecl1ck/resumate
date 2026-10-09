---
id: 3fdec
status: closed
created_at: 2026-10-08T14:46:03.290Z
updated_at: 2026-10-09T14:20:06.966Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-08T15:16:03.452Z
closed_at: 2026-10-09T14:20:06.966Z
---

# 对话区体验升级：安全发送拦截、自动滚动、Markdown 与折叠推理

## Background

用户实测对话区看到的问题：批准 / 拒绝待办后界面没有反馈、每条消息都开新会话导致历史消失（已在 a4367 修掉根因）、Agent 中间推理与工具原始 JSON 直接当聊天气泡显示、长对话不自动滚到最新、回复里的 Markdown 原样露出星号。本轮按仓库「Storybook 先行」硬规则先做原型与 story，等用户确认后再关单。

## Scope

- 有未决待办时点发送先出确认框，明确「发送会结算当前轮次并作废待审批的待办」，确认后才发送。
- 对话区自动滚动到最新消息 / 新待办。
- Agent 消息走 Markdown 渲染（最小安全实现）。
- 工具活动与中间 assistant 文本合成「推理与工具活动」折叠块，展开 / 折叠两态。
- 本地有未保存输入且服务端版本变化时，显示提示条 +「载入服务端版本」，用户不点不覆盖本地输入。

## Non-goals

- 不引入 Markdown 依赖：仓库没有 react-markdown / marked，本批用最小安全实现（标题 / 无序与有序列表 / 加粗 / 行内 code / 引用），表格、链接、图片、代码块保持原文。
- 不改 `ui/src/lib/api.ts` / `ui/src/lib/types.ts` 契约。
- 不显示真正的模型推理内容：`RunTimelineEvent` 没有 reasoning 事件类型，会话消息 content 里也没有（agent-core 的 `Message.reasoning` 未进会话消息），要做得先扩协议。

## Acceptance Criteria

- [x] 原型 `ui/prototypes/index.html` 先登记 5 个新状态（发送拦截、自动滚动、Markdown、折叠 / 展开、服务端已更新）。
- [x] Storybook story 覆盖默认 / 空 / 启动中 / 错误 / 超长 / Markdown / 折叠 / 拦截 / 服务端提示，`pnpm -C ui build-storybook` 通过。
- [x] 上述行为有单测断言，`pnpm -C ui test` 通过，`archkit inspect .` 通过。
- [x] **用户在 Storybook 里确认视觉与交互**：2026-10-09 用户逐个查看 5 个 iframe 直链（发送拦截、Markdown 渲染、折叠态、展开态、服务端已更新提示条）后确认认可。

## Implementation

- `ui/src/components/run-panel.tsx`：发送前拦截（pending 待办且轮次未关闭 → `ui/modal` 确认框）；`timelineRef` + `scrollTo` 自动滚到底；Agent 消息走 `kit/markdown`；`tool_progress` 与中间 assistant 文本合成 `@base-ui/react/collapsible` 折叠块（`defaultActivityOpen`）。
- `ui/src/components/resume-editor.tsx`：本地 dirty 且服务端签名变化时暂存服务端文档并显示提示条 +「载入服务端版本」；用户不点不覆盖，flush 成功后清除。
- `ui/src/components/kit/markdown.tsx`（新增）：最小安全 Markdown，只拼 React 元素，不使用 `dangerouslySetInnerHTML`。
- i18n：`workbench.run.sendConfirm.{title,description,confirm}`、`workbench.run.activity.summary`、`resume.editor.serverUpdated`、`resume.editor.loadServerVersion`（zh-CN 与 en 同构）。
- 新增 story：`ui/src/storybook/run-panel.stories.tsx`（9 个）、`ui/src/storybook/resume-editor.stories.tsx`（1 个）。

## Verification

- `pnpm -C ui test`：56 files / 466 tests passed。
- `pnpm -C ui build-storybook`：Storybook build completed successfully。
- `archkit inspect .`：Quality gates passed（含 ui-i18n / ui-form-contract / repo-privacy）。
- 原型章节：`#tokens`、`#components`、`#screen-editor`（新增「对话区状态（#screen-editor）」登记块与 5 条 state）。
- Storybook 评审路径：`Components/RunPanel` 的 `components-runpanel--default` / `--empty` / `--starting` / `--action-error` / `--long-message` / `--markdown-reply` / `--activity-collapsed` / `--activity-expanded` / `--send-blocked`，以及 `Components/ResumeEditor` 的 `components-resumeeditor--server-updated-while-dirty`。
- 已知限制：`--starting` / `--action-error` 的 AutoDrive 只在浏览器里可验（story 内自动驱动），需人工在 Storybook 里点开确认。
- 用户确认（2026-10-09）：在 worktree `docs/zj-fwwb-2026`（HEAD b893c92，含两次合并后的代码）上启动 Storybook，用户逐个打开以下 5 个直链并确认认可：
  `components-runpanel--send-blocked`、`components-runpanel--markdown-reply`、`components-runpanel--activity-collapsed`、`components-runpanel--activity-expanded`、`components-resumeeditor--server-updated-while-dirty`；确认后 Storybook 已停止，6007 端口释放。

## Related ADRs

- None.
