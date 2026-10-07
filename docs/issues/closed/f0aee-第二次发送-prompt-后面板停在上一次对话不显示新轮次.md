---
id: f0aee
status: closed
created_at: 2026-10-07T11:10:00.000Z
updated_at: 2026-10-07T10:55:25.994Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-07T10:51:21.703Z
closed_at: 2026-10-07T10:55:25.994Z
---

# 第二次发送 prompt 后面板停在上一次对话不显示新轮次

## Background

面板上已有一轮**已结束**的对话时再发 prompt，`POST /resumes/{id}/runs` 之后只发生一次 `/turns` 刷新（子进程还没建出新轮次），随后 20s 内再无任何 `/turns` 请求，面板全程停在上一轮的「轮次已关闭」内容；DB 里新轮次（如 `turn_282926a5703a | open | sess_8db00c7ef300`）确实存在，UI 从未显示。

两个 effect 叠加短路（`ui/src/components/run-panel.tsx`）：

- 79-85 行：`if (!run?.id || run.state === "turn_closed") return` —— 当前显示的旧轮次已关闭，直接停止轮询。
- 88-98 行：`if (!starting || run?.id) return` —— 本意是「新轮次出现前轮询」，但旧轮次的 `run.id` 已存在，也直接 return。

`start` 成功后那次 `invalidateQueries` 的 refetch 常常跑在子进程建新轮次之前（1~3s），拿回的仍是旧轮次；随后两处轮询都不跑，于是永远发现不了新轮次，直到手动刷新页面。

## Scope

- `ui/src/components/run-panel.tsx`：引入「已发送、等待新轮次」状态（记录提交时的 `run?.id` 作为基线），从点击发送到「`run.id` 变化」或超时（沿用 60s）之间持续轮询 `active-run`，不受当前旧轮次 `state === "turn_closed"` 短路；新轮次到达后再恢复常规节奏（未关闭轮次继续轮询，已关闭停止）。
- 失败/超时路径要清理「等待」状态，避免永久轮询。
- 测试：`ui/src/components/run-panel.test.tsx` 增加「当前显示已关闭轮次时点击发送仍持续轮询」「新轮次出现后切到新内容并不再显示旧的等待态」两条。

## Non-goals

- 不改后端 spawn 与轮次创建时序。
- 不改「轮次结束后保留最近一轮对话」的行为。
- 不改 SSE 订阅语义。

## Acceptance Criteria

- [x] 当前显示已关闭轮次的 RunPanel，在点击发送后仍按 1.5s 轮询 active-run，直到新轮次出现或 60s 超时。
- [x] 新轮次出现后 `run.id` 变化，面板切到新轮次内容并停止「等待」轮询；未关闭轮次继续常规轮询，已关闭轮次停止轮询（不回归）。
- [x] 发起失败（onError）时清理等待状态。
- [x] `pnpm -C ui test`、`pnpm -C ui run build`、`archkit inspect .` 全绿。
- [x] 合并后真实 5173 E2E：已有一轮结束对话时发第二个 prompt，`/turns` 持续轮询，面板切到新轮次（新 prompt / 工具调用 / 运行中或待确认），新轮次结束后旧对话被新对话取代。

## Implementation

- `ui/src/components/run-panel.tsx`：新增 `awaitingNewRun` 状态与 `submittedFromRunId` ref；`submit()` 在 mutate 前记录当前 `run?.id` 并置 `awaitingNewRun=true`。
- 轮询 effect 改为 `polling = awaitingNewRun || (run?.id !== undefined && run.state !== "turn_closed")`：等待新轮次期间不受旧轮次 `turn_closed` 短路，1.5s 轮询 `active-run`，最多 60s；新轮次到达（`run.id !== submittedFromRunId.current`）时清 `awaitingNewRun` 与 `starting` 并回到常规节奏。
- `start` 的 `onError` 同步清 `awaitingNewRun`，避免失败后永久轮询。
- 测试：`ui/src/components/run-panel.test.tsx` 新增「当前显示已结束轮次时点击发送仍持续轮询直到新轮次出现」（fake timers 断言 1.6s 内有 invalidate，并在新 run 到达后渲染新内容）。

## Verification

TDD Red：

```text
pnpm -C ui exec vitest run src/components/run-panel.test.tsx
→ 当前显示已结束轮次时，点击发送后仍持续轮询直到新轮次出现：Number of calls: 0
1 failed | 17 passed
```

Green：

```text
pnpm -C ui test        → Test Files 42 passed (42) / Tests 306 passed (306)
pnpm -C ui run build   → built
archkit inspect .      → Quality gates passed.
```

### 合并后真实 5173 两次发送 E2E（2026-10-07）

前置：面板已显示一轮已结束对话（header 显示轮次已关闭）。不点批准，连续发两条，避免把已关闭轮次的待办按钮当当前轮次点击（那会产生 409）。

send1「把我的姓名改成「张三」」网络：

```text
1.09s POST /resumes/res_aeba1b686aa4/runs
2.10s GET  /resumes/res_aeba1b686aa4/turns   <- 第一次刷新返回旧轮次 turn_028f10589a3b
3.11s GET  /resumes/res_aeba1b686aa4/turns   <- 轮询继续，拿到新轮次 turn_039e9d30e9ba
```

send2「把我的电话改成 13900000000」网络：

```text
6.16s POST /resumes/res_aeba1b686aa4/runs
7.16s GET  /resumes/res_aeba1b686aa4/turns   x2 -> 旧 turn_039e9d30e9ba + 新 turn_76ba70c4b813
10.18s GET /resumes/res_aeba1b686aa4/turns   <- 新轮次运行中继续轮询
```

面板采样：

```text
send1 t+2.1s :: 轮次已关闭 | ...（仍是旧内容）
send1 t+3.1s :: 运行中 | 预算 0/0 · 0/0 轮 | 把我的姓名改成「张三」
send2 t+7.2s :: 运行中 | 预算 0/0 · 0/0 轮 | 把我的电话改成 13900000000
```

断言：send1_seen=True、send2_seen=True、section[aria-label] 全程为 3、SECTIONS_NOT_3 为空、CONSOLE_ERRORS 为空。截图：headless E2E 输出的 before/after PNG（本地临时目录，未入库）。

## Related ADRs

- None.
