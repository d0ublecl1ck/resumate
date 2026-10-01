---
id: "55e99"
status: in-progress
created_at: 2026-10-01T02:00:00.000Z
updated_at: 2026-10-01T01:12:56.780Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:12:56.780Z
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

- [ ] `POST /pending-actions/{id}/approve|reject` 有真实封装，注释为 `METHOD + path`。
- [ ] `getActiveRun` 走真实端点：working-document 无 userTurnId 返回 undefined；有则映射 AgentRun（state/budget/timeline/pendingActions），无 mock 分支。
- [ ] AGENT_RUNS fixture 已清除（或说明仍被谁使用），getWorkbenchSummary 不再依赖 mock run。
- [ ] run-panel approve/reject 发出真实请求；提交中禁用；失败就地报错；成功后刷新 run。
- [ ] run-panel 订阅 SSE，`turn.updated` 触发 run 刷新；卸载后 EventSource 关闭（StrictMode 安全）。
- [ ] `pnpm -C ui test`（现有 25 files / 186 条不退化）、`pnpm -C ui build`、`archkit inspect .` 全部通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
