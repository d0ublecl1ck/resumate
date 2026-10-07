---
id: "49879"
status: closed
created_at: 2026-10-07T09:53:34.497Z
updated_at: 2026-10-07T10:04:33.001Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-07T09:53:42.631Z
closed_at: 2026-10-07T10:04:33.001Z
---

# 修复简历编辑页 Agent 对话发完 prompt 后不显示：active-run 查询 undefined 语义与整页 Loading 门

## Background

简历编辑页 `/resumes/:id` 的「Agent 对话」发出 prompt 后，`POST /api/resumes/{id}/runs` 返回 202，前端随后 `invalidateQueries(["active-run", id])`，但面板永远停在空态，控制台反复报：

```text
Query data cannot be undefined. Please make sure to return a value other than undefined from your query function. Affected query key: ["active-run","res_aeba1b686aa4"]
```

机制（React Query v5）：

1. `ui/src/lib/api.ts:197` 的 `getActiveRun` 在没有 open 轮次时 `return undefined`。React Query v5 的 `Query.fetch` 在 queryFn resolve 出 `undefined` 时抛错（`@tanstack/query-core` `query.ts` 的 runtime guard），该查询永远进不了 success 态：先 pending，再 error。
2. `ui/src/pages/resume-editor.tsx:29` 用 `runQuery.isPending || templateQuery.isPending || jdsQuery.isPending` 做整页 Loading 门。`start` 成功后 invalidate 触发 refetch，fetch 期间 `status` 又被打回 `pending`（无 data 时 `fetchState` 会重置 status），整页换成 `<PageLoading />`。
3. 整页卸载导致 `RunPanel` 卸载：`starting`、输入草稿、SSE 订阅全部丢失；重新挂载后 `starting=false`，不再轮询 active-run，于是面板永远空。

## Scope

- `ui/src/lib/api.ts`：`getActiveRun` 返回类型改为 `Promise<AgentRun | null>`，无 open 轮次时返回 `null`（合法空值语义），调用方同步。
- `ui/src/pages/resume-editor.tsx`：整页 Loading 门只在首屏生效，后台刷新（invalidate / 聚焦 refetch / reset）不得把编辑器打回 `<PageLoading />`。
- `ui/src/components/resume-editor.tsx` 与 `ui/src/components/run-panel.tsx`：`run` prop 接受 `AgentRun | null`。
- 测试：`ui/src/lib/run-api.test.ts` 断言 `null`；新增 `ui/src/pages/resume-editor.test.tsx` 覆盖「无 open 轮次进入 success 且不报 undefined」「后台刷新不打回 Loading、RunPanel 输入保留」。
- E2E 在合并到 main 后用无头浏览器驱动真实 dev 栈复验。

## Non-goals

- 不改 `backend/`，不动数据库模型配置。
- 不新增任何用户可见文案或视觉；如需要，先补 `ui/prototypes/index.html` 并走 Storybook 确认。
- 不改「轮次 finalize 后 `GET /turns?state=open` 为空、面板回到空态」这一既有行为（本工单只修「发完 prompt 永远看不到对话」）。
- 不借 `e13aa`，不动它。

## Acceptance Criteria

- [x] 新增测试在改实现前失败（Red）：`getActiveRun` 无 open 轮次 resolve `undefined`；无 open 轮次时页面出错且查询为 error；后台刷新期间页面回退 `PageLoading`。
- [x] `pnpm -C ui test` 全绿。
- [x] `pnpm -C ui run build` 成功。
- [x] 仓库根 `archkit inspect .` 通过。
- [x] 合并到 main 后无头浏览器实测：控制台无 `Query data cannot be undefined`；采样 `document.querySelectorAll('section[aria-label]').length` 始终为 3；面板出现用户消息 / 待确认动作卡片，并可 approve。

## Implementation

- `ui/src/lib/api.ts`：`getActiveRun` 返回类型改为 `Promise<AgentRun | null>`，无 open 轮次时 `return null`；注释写明 React Query v5 不接受 queryFn resolve 出 `undefined`。调用方 `getWorkbenchSummary` 与页面均用可选链，无需额外改动。
- `ui/src/pages/resume-editor.tsx`：新增 `pending` 与 `firstLoadRef`（`useEffect` 在首次全部 settle 后置 false），整页 Loading 门从「任一查询 pending」改为「首屏 && pending」。后台刷新（invalidate / 聚焦 refetch / reset）不再卸载编辑器。
- `ui/src/components/resume-editor.tsx`、`ui/src/components/run-panel.tsx`：`run` prop 放宽为 `AgentRun | null`。
- `ui/src/lib/run-api.test.ts`：无 open 轮次断言由 `toBeUndefined()` 改为 `toBeNull()`。
- 新增 `ui/src/pages/resume-editor.test.tsx`：三条用例覆盖 `data=null` 的 success、聚焦 refetch 期间不回退 Loading 且 RunPanel 输入保留、`resetQueries` 把查询打回 pending 时同样不回退 Loading。
- `README.md`：前端测试口径 `37 files / 271 passed`、story 文件 `21`。
- `.freak`：登记「finalize 后面板回到空态」这一未改行为与「新增页面 `useQuery` 沿用首屏 gate + 区块兜底」的复核线索。

取舍：不做 `getActiveRun` 的 mock 兜底、不放宽到 `state=all`（会把 finalized 轮次混进活跃轮次语义），也不新增任何用户可见文案/视觉。

## Verification

Red（改实现前，`pnpm -C ui exec vitest run src/lib/run-api.test.ts src/pages/resume-editor.test.tsx`）：

```console
× returns null when the resume has no open turn   AssertionError: expected undefined to be null
× 没有 open 轮次时进入 success（data=null），且不报 Query data cannot be undefined
    AssertionError: expected 'error' to be 'success'
× 窗口聚焦触发的后台 refetch 不回退整页 Loading，RunPanel 输入保留
    Error: expected document not to contain element, found <p>加载中</p>
× 后台刷新把 active-run 打回 pending 时也不回退整页 Loading
    Error: expected document not to contain element, found <p>加载中</p>
Test Files  2 failed (2)
     Tests  4 failed | 3 passed (7)  (EXIT=0)
```

Green：

```console
$ pnpm -C ui test
Test Files  37 passed (37)
     Tests  271 passed (271)  (EXIT=0)

$ pnpm -C ui run build
✓ built in 1.27s  (EXIT=0)

$ archkit inspect .
Quality gates passed.  (EXIT=0)
```

合并后端到端实测（无头 Chromium，`locale="zh-CN"`，1440×900，复用 admin 会话 Cookie）：

```console
打开 http://localhost:5173/resumes/res_aeba1b686aa4
输入「请把简历 res_aeba1b686aa4 的一句话头衔改成「资深后端工程师」」→ 点「发送」

# 50ms 采样 document.querySelectorAll('section[aria-label]').length，共 292 次
section_min = 3   section_max = 3   section_non3 = 0
console.errors = []        # 无 Query data cannot be undefined
page_errors   = []

# 中间栏 section[aria-label] 文本转场
t+ 3.68s  正在启动运行体…
t+ 4.76s  运行中 · 预算 0/0 tokens · 0/0 轮
t+ 5.81s  运行中 + 用户消息「将一句话头衔改为「资深后端工程师」」
t+10.95s  待确认 + 内容修改（1 处）diff + [批准并应用] [拒绝]
点击「批准并应用」→ 运行中 · 结果已消费（diff 卡保留）
final     还没有对话

# approve 后服务端状态（curl 查询同一会话 Cookie）
turn_7d9685c99424 state=finalized
pendingAction pa_c9e8f4bd4660 state=consumed
result: versionId=ver_81b25174ffa2 changeCount=1 affectedSections=[基础信息]
GET /resumes/res_aeba1b686aa4 -> document.basics.headline=资深后端工程师 saveState=committed
```

遗留（未改，见 Non-goals）：approve / finalize 之后 `GET /turns?state=open` 返回 `[]`，`getActiveRun` 得到 `null`，面板从对话退回「还没有对话」。要保留已结束轮次需要另开设计，不能只放宽到 `state=all`。

## Related ADRs

- None.
