---
id: bfa49
status: closed
created_at: 2026-10-07T11:31:46.340Z
updated_at: 2026-10-07T11:41:35.615Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-07T11:31:58.061Z
closed_at: 2026-10-07T11:41:35.615Z
---

# 主档助手与工作台一致：关闭轮次待办只读失效与可用性动作分流

## Background

两个「同一份逻辑在两个界面各写一遍、随后分叉」的缺陷：

1. issue fe56e 让后端在所有关轮路径把该轮 `pending` 待办置 `stale`，并在
   `ui/src/components/run-panel.tsx` 加了前端兜底：`turn_closed` 且仍为 `pending` 的历史行按失效
   只读渲染。但 `ui/src/components/profile-assistant.tsx` 没有这份兜底——没有 open 轮次时
   `activeTurn` 回退到最近一条已关闭轮次，其 `pendingActions` 直接交给 `PendingActionCard`，
   于是方案 A 有意保留的历史 `state=pending` 行在主档助手仍渲染出可点的「批准并应用」，
   点击必得 `409 TURN_NOT_OPEN`。
2. `settings-form.tsx` 已由 d0f75 按 `AgentAvailabilityAction` 分流，而
   `profile-assistant.tsx` 的可用性引导 `onAction` 仍只区分 `retry` 与「其余一律
   `navigate("/settings")`」：`start_chat` 也会被带到设置页，与动作语义不符；上游新增动作同样会误触发导航。

## Scope

- `ui/src/components/kit/pending-action.tsx`：新增显式 `turnClosed` 输入与共享投影
  `pendingActionForClosedTurn`；关闭轮次且仍 `pending` 的待办在卡片内统一映射为 `stale` 只读，
  不再由调用方各自实现。
- `ui/src/components/run-panel.tsx`：删除内联兜底，改为向 `PendingActionCard` 传 `turnClosed`。
- `ui/src/components/profile-assistant.tsx`：向 `PendingActionCard` 传 `turnClosed`；可用性引导
  `onAction` 按 `AgentAvailabilityAction` 分流，`start_chat` 聚焦本抽屉输入框，`configure_model`
  才 `navigate("/settings")`，`retry` 重试，未知动作留在当前页。
- `ui/src/components/agent-onboarding.tsx`：新增共享的 `agentAvailabilityActionEffect` 归一函数。
- i18n：把兜底失效原因从 workbench 命名空间收敛到 `common.pendingAction`，两语键结构一致。
- 测试：`ui/src/components/kit/pending-action.test.tsx`（新增）、
  `ui/src/components/profile-assistant.test.tsx`、`ui/src/components/run-panel.test.tsx`。
- 原型：同步 `ui/prototypes/index.html` 的 `#screen-editor` 与 `#screen-profile` 状态清单。

## Non-goals

- 不改后端，不做历史 pending 数据回填。
- 不改 `settings-form.tsx`（并行 worktree `fix/settings-access-panel` 占用）。
- 不改 approve/reject 的 409 语义，也不改未关闭轮次的既有行为。

## Acceptance Criteria

- [x] 主档助手在最新轮次已关闭且其待办仍是历史 `pending` 时不渲染可点的「批准并应用」，并显示失效标签与原因。
- [x] 工作台行为不回归：`turn_closed` 同样只读失效，未关闭轮次仍可点；兜底逻辑只有一份共享实现。
- [x] 主档助手可用性引导按 action 分流：`start_chat` 不跳 `/settings`，`configure_model` 才跳；`retry` 与未知动作都不误导航。
- [x] `pnpm -C ui test` 全绿、`pnpm -C ui run build` 成功、`archkit inspect .` 通过。
- [x] 合并到 main 后跑真实 5173 E2E：关闭轮次历史 pending 不出现可点按钮且显示失效原因；未关闭轮次待办仍可点。

## Implementation

- `ui/src/components/kit/pending-action.tsx`：新增共享投影
  `pendingActionForClosedTurn(action, turnClosed, staleReason)` 与 `PendingActionCard` 的显式
  `turnClosed` 输入。关闭轮次且仍为 `pending` 的待办在卡片内统一映射为 `stale` 并补失效原因，
  动作按钮因此不渲染；未关闭轮次与既有状态映射不变。这是唯一一份「轮次已关闭 -> 待办失效」实现。
- `ui/src/components/run-panel.tsx`：删除原内联兜底 `actions` 映射与 `PendingAction` 类型导入，
  改为 `turnClosed={run?.state === "turn_closed"}` 传给卡片。
- `ui/src/components/profile-assistant.tsx`：计算
  `activeTurnClosed = activeTurn !== undefined && activeTurn.state !== "open"` 并传入卡片；
  可用性引导 `onAction` 改走 `agentAvailabilityActionEffect` 分流，新增 `composerRef` 供
  `start_chat` 聚焦对话输入框。
- `ui/src/components/agent-onboarding.tsx`：新增 `AgentAvailabilityActionEffect` 与
  `agentAvailabilityActionEffect(action)`；`start_chat -> chat`、`configure_model -> settings`、
  `retry -> retry`、未知动作 `stay`。
- i18n：`workbench.run.closedTurnActionStale` 收敛为共享的
  `common.pendingAction.closedTurnStaleReason`（zh-CN / en 键结构一致）。
- `ui/prototypes/index.html`：`#screen-editor` 与 `#screen-profile` 的 states 补登记关闭轮次待办只读
  与可用性动作分流。
- `.freak`：第 69、89 条线索标记已解决，新增 `pending-action.tsx` 的 `turnClosed` 显式输入残余线索。

## Verification

TDD Red（改实现前）：

```text
pnpm -C ui exec vitest run src/components/kit/pending-action.test.tsx src/components/profile-assistant.test.tsx src/components/run-panel.test.tsx
→ Test Files 3 failed (3) | Tests 9 failed | 46 passed (55)
  - TypeError: pendingActionForClosedTurn is not a function
  - TypeError: agentAvailabilityActionEffect is not a function
  - 已关闭轮次仍渲染出可点「批准并应用」（element not.toBeInTheDocument 失败）
  - 找不到 common.pendingAction.closedTurnStaleReason
```

Green（改实现后）：

```text
pnpm -C ui exec vitest run（同上三个文件）   → Test Files 3 passed | Tests 55 passed
pnpm -C ui test（rebase 到最新 main 后最终） → Test Files 50 passed | Tests 402 passed
pnpm -C ui run build                       → ✓ built
archkit inspect .                          → Quality gates passed.
```

说明：`pnpm -C ui test` 首次因 `.freak` 第 87 条已记录的
`resume-library.test.tsx` 默认 1s 超时偶发失败一次；单独重跑该文件 3 次均通过、整套重跑通过，
与本次改动无关。实现提交 `8302bed` 已 ff-only 合并到 main；rebase 前后各跑一次完整测试、
构建与门禁，结果一致。

### 合并后真实 5173 E2E（2026-10-07）

无头 Playwright（headless chromium，`locale=zh-CN`，1440×1000）复用本机 admin 会话打开
`http://localhost:5173/profile`，再打开「对话维护资料」抽屉。通过路由拦截
`GET /api/sessions/sess_6d3cf19b4923/turns`（真实主档会话，含 11 条 profile 轮次）改写最新轮次的
`state` 与 `pendingActions` 来构造两种场景；后端与其余请求均走真实服务。

场景 A —— 最新轮次已关闭（`finalized`）且待办仍是历史 `pending`：

```text
批准并应用按钮数=0、拒绝按钮数=0、已失效标签数=1、失效原因数=1、console错误数=0
卡片显示「已失效」与「失效原因：该待办已随轮次关闭失效」
```

场景 B —— 最新轮次未关闭（`open`）时的同一待办：

```text
批准并应用按钮数=1、批准并应用可用=true、拒绝按钮数=1、已失效标签数=0、console错误数=0
```

截图 `rsm-e2e-closed-turn.png` 与 `rsm-e2e-open-turn.png`、E2E 脚本均存于本机临时目录，未入库；
脚本打印以上断言并以退出码 0 结束。

## Related ADRs

- None.
