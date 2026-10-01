---
id: d90a8
status: closed
created_at: 2026-10-01T05:00:00.000Z
updated_at: 2026-10-01T01:33:17.880Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:33:10.747Z
closed_at: 2026-10-01T01:33:17.880Z
---

# 前端 run-panel 发起真实 run

## Background

- 后端已有 `POST /resumes/{resume_id}/runs`（83c41）：202 `{runId, status}`；未配置模型 409 `MODEL_NOT_CONFIGURED`；并发满 429 `RATE_LIMITED`；PAT 403。
- 前端 run-panel 的输入框此前只是本地占位，不发起任何 run。

## Scope

- `ui/src/lib/api.ts` 新增 `startRun(resumeId, {prompt, executionMode?})`（`POST /resumes/{id}/runs`）。
- `run-panel.tsx`：提交调 startRun；`MODEL_NOT_CONFIGURED` 引导去设置配置模型；`RATE_LIMITED` 可读提示；其它错误按机器错误码映射 i18n，不回显服务端原文。
- 发起后显示「正在启动」并轮询 active-run（最多 60s），run 出现即结束；不自行造轮次。
- 发起期间禁用输入与提交并置 `aria-busy`。
- `MachineErrorCode` 增 `MODEL_NOT_CONFIGURED`；zh-CN / en 文案同步；补测试。

## Non-goals

- 不碰 backend / agent-core；不改 `AgentAvailabilityNotice` 的 available 判定。
- 不做队列/SSE 事件日志；不合并回 main。

## Acceptance Criteria

- [x] 提交后发出 `POST /resumes/{id}/runs`（含 prompt 与 executionMode）。
- [x] `MODEL_NOT_CONFIGURED` 显示配置引导且不出现服务端原始 message；`RATE_LIMITED` 与其它错误显示可读文案且不回显原文。
- [x] 发起期间输入与提交禁用、`aria-busy=true`；成功后显示「正在启动」，run 出现后消失。
- [x] `pnpm -C ui test` 现有 27 files / 199 不退化；`pnpm -C ui build`、`archkit inspect .` 通过。

## Implementation

- `ui/src/lib/api.ts`：新增 `startRun(resumeId, { prompt, executionMode? })` → `POST /resumes/{id}/runs`，沿用既有 `request<T>` 约定与 `METHOD + path` 注释。
- `ui/src/lib/types.ts`：`MachineErrorCode` 增 `MODEL_NOT_CONFIGURED`（409，83c41）。
- `ui/src/components/run-panel.tsx`：新增必填 `resumeId` 属性；`start` mutation 调 `startRun`；`runStartErrorKey` 把机器错误码映射到 `workbench.run.errors.*`（MODEL_NOT_CONFIGURED / RATE_LIMITED / NETWORK_ERROR / generic），**不回显服务端原始 message**；发起后 `starting=true` 显示「正在启动」并轮询 active-run（1500ms，最多 60s），`run` 出现即结束；发起期间 textarea/按钮 `disabled` 且 textarea `aria-busy`；⌘/Ctrl+Enter 与发送按钮都走 `submit()`；审批错误仍用原 `workbench.run.actionError`。
- `ui/src/components/resume-editor.tsx`：向 `<RunPanel>` 传 `resumeId={resume.id}`。
- `ui/src/mocks/handlers.ts`：新增默认 `POST /api/resumes/:id/runs` 202 handler。
- i18n：`workbench.run.starting` 与 `workbench.run.errors.{modelNotConfigured,rateLimited,network,generic}`（zh-CN / en 键结构一致）。
- 测试：`run-panel.test.tsx` 新增 6 条（POST 参数与启动态、MODEL_NOT_CONFIGURED 引导且无原文、RATE_LIMITED、通用错误、发起中禁用+aria-busy、run 出现后结束启动态）。

## Verification

红（实现前）：`run-panel.test.tsx` 新增 6 条全部失败（未发 POST、无启动态、无错误映射）。

绿：

```console
$ pnpm -C ui test
Test Files  27 passed (27)
     Tests  205 passed (205)

$ pnpm -C ui build
tsc -b && vite build -> 2368 modules transformed, built in 247ms（仅既有 >500kB chunk 提示）

$ archkit inspect .
Quality gates passed.
```

基线 27 files / 199，现 27 files / 205（新增 6，0 退化）。

流程纠正：本工单最初三个提交误用旧 issue `55e99` 的 trailer；已创建正确 issue `d90a8` 并用 `git rebase --exec` 把三个提交的 trailer 改写为 `Issue: d90a8`（代码内容未变，提交哈希随之更新）。

## Related ADRs

- None.
