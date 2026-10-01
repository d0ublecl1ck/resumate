---
id: "55e99"
status: closed
created_at: 2026-10-01T02:00:00.000Z
updated_at: 2026-10-01T01:17:09.095Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:12:56.780Z
closed_at: 2026-10-01T01:17:09.095Z
---

# 前端 Agent Run 接真实端点并接上 SSE

## Background

- `getActiveRun` 仍是 `resolve(AGENT_RUNS.find(...))` 纯 mock；`run-panel` 的 approve/reject 只改本地 state，不发请求。
- 后端已就绪：working-document、GET /turns/{id}、POST /pending-actions/{id}/approve|reject、GET /turns/{id}/events（SSE）。
- 前端已有 `turn-events.ts` 订阅封装与 run-panel/PendingActionCard/Diff 组件。

## Scope

- `api.ts`：新增 approve/reject 封装；`getActiveRun` 改为 working-document → GET turn → 映射为 AgentRun（含 budget/timeline/pendingActions），无活动轮次返回 undefined；移除 AGENT_RUNS mock 分支与 fixture。
- `run-panel.tsx`：approve/reject 走真实 mutation（提交中禁用、失败就地报错、成功后失效 run 查询）；用 `turn-events.ts` 订阅当前轮次 SSE，收到 `turn.updated` 刷新 run 查询；StrictMode 安全 cleanup。
- MSW handlers 与现有测试同步；README 与 `.freak` 计数/线索按实测同步。

## Non-goals

- 不碰后端、不碰 agent-core、不做压缩/摘要、不做队列。
- 不改 agent-onboarding 的 available 判定（运行体就绪信号不存在）；「有活动轮次」作为候选信号只报告不实现。
- 不新增页面视觉规则；必要文案走 i18n 双语。

## Acceptance Criteria

- [x] `POST /pending-actions/{id}/approve|reject` 有真实封装，注释为 `METHOD + path`。
- [x] `getActiveRun` 走真实端点：working-document 无 userTurnId 返回 undefined；有则映射 AgentRun（state/budget/timeline/pendingActions），无 mock 分支。
- [x] AGENT_RUNS fixture 已清除（或说明仍被谁使用），getWorkbenchSummary 不再依赖 mock run。
- [x] run-panel approve/reject 发出真实请求；提交中禁用；失败就地报错；成功后刷新 run。
- [x] run-panel 订阅 SSE，`turn.updated` 触发 run 刷新；卸载后 EventSource 关闭（StrictMode 安全）。
- [x] `pnpm -C ui test`（现有 25 files / 186 条不退化）、`pnpm -C ui build`、`archkit inspect .` 全部通过。

## Implementation

- `ui/src/lib/api.ts`：`getActiveRun` 改为 `GET /resumes/{id}/working-document` → `GET /turns/{userTurnId}` → `GET /turns/{id}/state`（预算，best-effort），`mapTurnToRun` 映射为 `AgentRun`（state 由轮次状态 + 待办状态推导，timeline 由轮次 message/result 推导，不虚构事件）；无 `userTurnId` 返回 `undefined`。新增 `approvePendingAction` / `rejectPendingAction`（`POST /pending-actions/{id}/approve|reject`）。`getWorkbenchSummary` 不再读 mock，改为逐份简历 `getActiveRun` 累加真实待办。
- `ui/src/lib/types.ts`：`PendingAction.toolCallId` 改为可选（后端未暴露）；新增后端投影类型 `ApiTurn` / `ApiTurnPendingAction` / `TurnStateResponse`。
- `ui/src/lib/content.ts`：删除 `AGENT_RUNS` fixture 及其 `AgentRun` 导入（已无引用）。
- `ui/src/components/run-panel.tsx`：删除本地 `setRun` 伪交互；approve/reject 走 `useMutation`（`onMutate` 记 submittingId、`onError` 就地报错、`onSuccess` 失效 `["active-run", resumeId]`）；新增 `useEffect` 经 `subscribeTurnEvents` 订阅当前轮次，`turn.updated` 触发失效；cleanup 直接返回退订函数（StrictMode 安全，无一次性 ref 守卫）。
- `ui/src/components/kit/pending-action.tsx`：新增可选 `busy`，提交中禁用批准/拒绝按钮并置 `aria-busy`；`toolCallId` 缺省时不渲染该行（与 `baseVersionId` 同款条件渲染，沿用既有 disabled 工具类）。
- `ui/src/lib/turn-events.ts`：无全局 `EventSource` 时退化为 no-op 订阅，避免非浏览器环境抛错。
- `ui/src/mocks/handlers.ts`：补 working-document / turns / turns state / approve / reject handlers（`res_fe_lead` 上挂带待办的活跃轮次）。
- i18n：新增 `workbench.run.actionError`（zh/en）；删除已无引用的 `workbench.run.approvedEvent` / `rejectedEvent`。
- 测试：`ui/src/lib/run-api.test.ts`（4）、`ui/src/components/run-panel.test.tsx`（8）、`turn-events.test.ts`（+1 无 EventSource 守卫）。

## Verification

红（实现前）：`run-api.test.ts` 因 `approvePendingAction is not a function` 与 mock `getActiveRun` 不映射真实轮次，3 failed / 1 passed；`run-panel.test.tsx` 因仍走本地 setState、未订阅 SSE，7 failed / 1 passed。

绿：

```console
$ pnpm -C ui test
Test Files  27 passed (27)
     Tests  199 passed (199)

$ pnpm -C ui build
tsc -b && vite build -> 2368 modules transformed, built in 249ms（仅有既有的 >500kB chunk 提示）

$ archkit inspect .
Quality gates passed.
```

基线为 25 files / 186 条，现 27 files / 199 条（新增 13 条，0 退化）。

## Related ADRs

- None.
