---
id: fe56e
status: closed
created_at: 2026-10-07T10:58:44.575Z
updated_at: 2026-10-07T11:10:37.858Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-07T10:59:01.555Z
closed_at: 2026-10-07T11:10:37.858Z
---

# 结束轮次时待办必须同步失效（后端权威 + 前端兜底）

## Background

`agent_pending_actions` 里存在 `state=pending` 的待办挂在一个已结束（`finalized`）的
`agent_turns` 上，例如 `pa_cf827e8c2fed | pending | turn_1c5b5600968c | finalized`。工作台面板
照常渲染可点的「批准并应用」，点击必然得到 `409 TURN_NOT_OPEN`（「所属轮次已关闭，无法处理待办」）
——死路按钮。

根因是「结束轮次」与「待办失效」不是同一个动作，只有部分关轮路径清了 pending：

- `backend/app/modules/agent/service.py` 的 `_close_open_turn` 只在 rebase 冲突分支把 pending 置 stale；
  正常结算分支没有。
- `finalize_turn`（resume 路径与 profile 路径）都没有把该轮 pending 置 stale。
- `cancel_turn` 与 `_close_profile_turn` 已经置 stale。

于是待办可以比它的轮次活得久。方案采用「后端为权威 + 前端兜底」：后端在所有结束轮次的路径上把该轮
仍为 pending 的待办置 stale（沿用现有 state 取值，不新造状态）；前端在 `run.state === "turn_closed"`
时不渲染可点的 approve/reject。按用户决定不做历史回填，已存在的旧 pending 行保持原样，由前端兜底覆盖。

## Scope

- `backend/app/modules/agent/service.py`：新增集中失效 helper；把 `_apply_result` 收敛为 finalize /
  cancel / 自动结算的统一关轮出口，并在所有关轮路径上把 pending 置 stale。
- `backend/tests/test_agent.py`、`backend/tests/test_profile_agent_endpoints.py`：补「结束轮次后该轮
  pending 待办变 stale」的失败测试，覆盖 finalize、自动结算、cancel、profile finalize。
- `ui/src/components/run-panel.tsx`：`run.state === "turn_closed"` 时把仍为 pending 的待办按失效只读
  渲染，不出现可点的「批准并应用」。
- `ui/src/i18n/locales/zh-CN/workbench.ts` 与 `ui/src/i18n/locales/en/workbench.ts`：补兜底说明文案，
  两语键结构一致。
- `ui/src/components/run-panel.test.tsx`：补「已关闭轮次不渲染可点批准/拒绝 + 显示失效说明」与
  「未关闭轮次仍可点」两条渲染断言。

## Non-goals

- 不做历史数据回填：已存在的旧 pending 行保持原样，不写一次性迁移或批量 UPDATE。
- 不新增待办状态取值。
- 不改 `decide_action` 对关闭轮次的 409 语义。
- 不改 rebase 对 approved 待办的既有失效逻辑。

## Acceptance Criteria

- [x] finalized 轮次的 pending 待办在同一事务内变为 stale，且其 staleReason 非空。
- [x] cancel、自动结算（起新轮次关旧轮）、profile finalize 与 profile supersede 同样生效。
- [x] 前端在 `turn_closed` 时不渲染可点的「批准/拒绝」，并给出失效说明；未关闭轮次行为不回归。
- [x] `cd backend && uv run pytest -q`、`pnpm -C ui test`、`pnpm -C ui run build`、`archkit inspect .` 全绿。
- [x] 合并后真实 5173 E2E：目标场景 DB 待办为 stale，页面无可点「批准并应用」。

## Implementation

- `backend/app/modules/agent/service.py`：新增 `_expire_pending_actions(db, turn, reason)`，只把该轮
  `state == "pending"` 的待办置 `stale` 并写 `stale_reason`（沿用既有取值）；把 `_apply_result` 改成统一
  关轮出口 `_apply_result(db, turn, version, message, state, *, stale_reason=None)`，进入即先失效该轮 pending。
  finalize（resume/profile）、cancel（resume/profile）、起新轮次时的 `_close_open_turn` 自动结算都经它关轮；
  `_close_profile_turn`（主档被新轮次取代）直接调 helper。原先分散在各处的内联置 stale 循环被删除，
  关轮与待办失效收敛为同一动作。
- `backend/tests/test_agent.py`：`test_finalize_marks_pending_actions_stale`（finalize 响应与随后 GET 均为
  stale）、`test_begin_settles_previous_open_turn_pending_actions`（自动结算路径）。
- `backend/tests/test_profile_agent_endpoints.py`：`test_profile_finalize_marks_pending_actions_stale`。
- `ui/src/components/run-panel.tsx`：渲染前把 `run.state === "turn_closed"` 且仍为 `pending` 的待办映射为
  `stale`，`staleReason` 缺省填 i18n 文案，因此不再渲染可点的 approve/reject。
- `ui/src/i18n/locales/zh-CN/workbench.ts` 与 `ui/src/i18n/locales/en/workbench.ts`：新增
  `workbench.run.closedTurnActionStale`。
- `ui/src/components/run-panel.test.tsx`：新增「已关闭轮次不渲染可点批准/拒绝并显示失效说明」与
  「未关闭轮次仍可点」两条断言。

## Verification

TDD Red（改实现前）：

```text
cd backend && uv run pytest -q -k "marks_pending_actions_stale or settles_previous_open_turn_pending_actions"
→ 3 failed, 1 passed（finalize / profile finalize / 自动结算均为 'pending' != 'stale'）

cd ui && npx vitest run src/components/run-panel.test.tsx
→ 1 failed | 19 passed（已关闭轮次仍渲染出「批准并应用」按钮）
```

Green（改实现后）：

```text
cd backend && uv run pytest -q    → 254 passed
pnpm -C ui test                   → 42 files / 308 passed
pnpm -C ui run build              → built
archkit inspect .                 → Quality gates passed.
```

### 合并后真实 5173/8000 E2E（2026-10-07）

无头 Playwright（`locale=zh-CN`）复用本地 admin 会话打开
`http://localhost:5173/resumes/res_aeba1b686aa4`。脚本在真实后端上新建 approval 轮次 → preview 造出
pending → finalize 关轮，再读回 DB 并在页面上断言。

权威路径（后端真失效）：

```text
POST /resumes/res_aeba1b686aa4/turns            → turn_ad054066b1e4 (open, approval)
POST /turns/turn_ad054066b1e4/patches:preview   → pa_595ec03588f8 (pending)
POST /turns/turn_ad054066b1e4/finalize          → state=finalized，响应内待办 state=stale
GET  /turns/turn_ad054066b1e4/pending-actions   → state=stale, staleReason=轮次已结束

psql resumate：
 pa_595ec03588f8 | stale | 轮次已结束 | turn_ad054066b1e4 | finalized | res_aeba1b686aa4
```

页面断言：轮次已关闭=true、批准并应用按钮=0、拒绝按钮=0、已失效标签=true、console error=0；卡片显示
「失效原因：轮次已结束」。截图 `closed_turn_no_approve.png`（本地临时目录，未入库）。

前端兜底路径（模拟按方案 A 保留的历史遗留 pending 行）：拦截
`GET /api/resumes/res_aeba1b686aa4/turns`，把 stale 改回 pending 并清空 staleReason 后，页面依旧不渲染可点
按钮，并显示兜底文案：

```text
轮次已关闭=true、批准并应用按钮=0、拒绝按钮=0、已失效标签=true
失效原因文案=该待办已随轮次关闭失效、console error=0
```

正常路径未回归：对另一个新建的 open 轮次（`turn_4640d9fe5a46`，pending `pa_5770fcb4b36b`）页面渲染出可点的
「批准并应用」，点击后读回 `state=approved`；随后 cancel 关轮，DB 见
`pa_5770fcb4b36b | approved | turn_4640d9fe5a46 | cancelled`。

E2E 过程中只在真实后端新建轮次，未回填或改写任何历史 pending 行。

## Related ADRs

- None.
