---
id: 11ad1
status: open
created_at: 2026-10-07T10:59:24.979Z
updated_at: 2026-10-07T11:00:06.825Z
priority: medium
labels: []
parent: null
blocked_by: []
---

# 会话作用域契约化：会话用途或 GET /sessions?scope=

## Background

### 背景

主档助手（`ui/src/components/profile-assistant.tsx`）需要找到「属于主档的那条会话」，但契约里会话没有用途：会话只绑 owner，可以横跨多份简历与主档，scope 是轮次的属性（`docs/agent/agent-operation-api.md` §19.1 / §21.1）。于是前端只能在读侧猜——遍历 `GET /sessions`，对每个候选再 `GET /sessions/{id}/turns`，只采用「至少一条轮次且全部 `scope=profile`」的会话。

这个猜法既慢又会被真实数据击穿：简历 run 也会创建会话，一旦同一条会话里混入 resume 轮次，它就被整体排除，其中的 profile 对话也随之不再显示。本工单的目标是把「这条会话是不是主档用途」变成一个可查询的契约事实，而不是前端逐个试探。

### 现状：前端解析器（问题现场）

`ui/src/components/profile-assistant.tsx:120-134` 的 `["profile-session"]` 查询：

```ts
const profileSessionQuery = useQuery({
  queryKey: ["profile-session"],
  enabled: open && canChat && !createdSessionId,
  queryFn: async () => {
    const candidates = await listSessions()
    for (const candidate of candidates) {
      const candidateTurns = await listSessionTurns(candidate.id)
      if (candidateTurns.length > 0 && candidateTurns.every((turn) => turn.scope === "profile")) {
        return candidate.id
      }
    }
    return null
  },
})
```

- 最坏 N+1 次请求：1 次 `GET /sessions` + 最多 N 次 `GET /sessions/{id}/turns`（N 为 `list_sessions` 返回条数，服务端上限 50）。
- 判定条件极窄：只要有任意一条 resume 轮次，整条会话被排除，里面的 profile 轮次也不再展示。
- 返回 null 时前端新建会话；这是当前唯一「安全」的收敛方式，但代价是历史主档对话看起来丢了。

### 现状：硬证据（真实数据）

session `sess_279d28c95bfd` 的轮次是混合的：

| turn | scope | resumeId |
| --- | --- | --- |
| `turn_285a92a126bf` | `resume` | `res_aeba1b686aa4` |
| `turn_7a386f1dbc02` | `profile` | null |
| `turn_ee377dae9fac` | `profile` | null |

按当前解析器，这条会话因含 `turn_285a92a126bf` 被整体排除，两条 profile 轮次不再显示（数据未删除）。反过来，简历 run 创建的会话一度被助手当成主档对话展示——这正是 `ee3b5` 修复的现场：最新会话含 resume 轮次时助手会误采。

### 现状：契约现状

- `backend/app/modules/agent/schemas.py:247` `SessionResponse` 只有 `id` / `createdAt` / `updatedAt` / `lastActiveAt`，**没有 scope**。
- `backend/app/modules/agent/dao.py:108` `list_sessions` 只按 `owner_id` 过滤、按 `last_active_at desc, created_at desc` 排序、`limit 50`，没有任何用途维度。
- `docs/agent/agent-operation-api.md` §19.1：「agent_sessions | id, owner_id, created_at, updated_at, last_active_at | 会话身份只绑 owner；**不含 resume_id**（一个会话可跨多份简历）」；§21.1：「会话（agent_sessions）**只绑 owner**，不绑 resume 或 profile：一次会话可以横跨多个简历与主档。scope 是轮次属性，不是会话属性。」
- `AgentTurn` 已有 `scope`（`backend/app/modules/agent/models.py:22`，默认 `resume`）与可空 `resume_id`（`:23`），因此「这条会话里有没有 resume 轮次」在数据层已经可判定。

### 目标

1. 让前端不再做 N+1 试探：读侧一次查询就能拿到「主档用途」的会话候选。
2. 不改变既有契约语义：会话仍只绑 owner、scope 仍是轮次属性；简历链路与既有客户端行为不受影响。
3. 明确记录历史混合会话的当前处理方式，并把「如何展示 / 是否迁移」列为待决点，不在本工单内擅自处理。

### 候选方案与推荐

**方案 A（推荐）：只读侧新增可选查询参数 `GET /sessions?scope=profile`**

服务端按轮次筛：返回「至少有一条轮次，且不含任何 `scope=resume` 轮次」的会话。

- `backend/app/modules/agent/api.py:256` `list_sessions` 增加可选 query `scope`，取值仅允许 `profile`（当前读侧只有这一个用途；非该值返回 422 `VALIDATION_FAILED`）。
- `backend/app/modules/agent/service.py:884` / `dao.py:108` 增加过滤：过滤条件作用在 owner 过滤之后、`limit` 之前（先过滤、再排序、再 limit，避免候选被更早的 resume-only 会话挤出结果）。
- `SessionResponse` 保持现状，不改 schema、不迁移数据库。
- 前端 `ui/src/lib/api.ts:253` `listSessions(scope?)` 拼 `?scope=profile`；`profile-assistant.tsx:120-134` 删掉 N+1 循环，直接取服务端返回的第一条（仍为最近活跃优先）。
- 推荐理由：向后兼容、无 schema 变更、无数据迁移，改动面小且可逆；语义直接落在唯一已有的事实来源（轮次的 scope）上，不需要新增用途状态的写入路径与一致性维护；立刻消除 N+1（最多 51 次请求 -> 1 次）；若未来确实需要更强的会话用途语义，可在方案 B 之上再叠，A 不挡 B。

**方案 B：给会话引入「用途 / 来源」字段**

在 `agent_sessions` 上新增 `purpose`（或 `origin`，取值如 `resume` / `profile` / `mixed`），写入时确定（建会话或创建首个轮次时落库）。

- 语义更强：会话自身就带用途，读侧不依赖轮次聚合；未来会话列表可以按用途分组。
- 代价：涉及数据库迁移、写入路径改造（`create_session` / `POST /turns` / run 建轮次）、契约变更（`SessionResponse` 增字段）、历史行回填策略。
- 「一条会话可以横跨多个简历与主档」是当前契约的显式特征（§21.1），引入会话级用途等于收紧这条语义，需要单独确认是否接受。

**推荐结论**：本工单按 **方案 A** 开工，先止血 N+1 与误采且不触碰契约与数据；方案 B 作为后续可选增强，只有在「会话列表要按用途呈现 / 需要会话级用途审计」被真实提出时再单独开单。

## Scope

- `backend/app/modules/agent/api.py`：`GET /sessions` 新增可选 `scope` 查询参数（仅 `profile`），非法值 422。
- `backend/app/modules/agent/service.py` + `dao.py`：按「至少一条轮次且无 resume 轮次」过滤 owner 的会话；过滤先于 `limit`。
- `ui/src/lib/api.ts`：`listSessions` 支持传入 scope 并拼查询串。
- `ui/src/components/profile-assistant.tsx`：删除 `["profile-session"]` 的 N+1 解析循环，改为单请求取候选。
- `docs/agent/agent-operation-api.md`：§19.2 端点表补充 `scope` 查询参数语义与「不含 resume 轮次」的判定。
- 测试：后端 pytest 覆盖过滤语义与向后兼容；前端 MSW 覆盖「单请求解析」「混合会话不采用」。

### 待决点（必须在实现前对齐）

- **已经被混入 resume 轮次的历史会话如何展示 / 迁移？** 当前保守做法是整体排除（如 `sess_279d28c95bfd` 的两条 profile 轮次不再显示），数据未删、也未迁移；方案 A 不改变该行为。可选出路：(1) 维持整体排除，只在 UI 上说明历史主档对话可能不在其中；(2) 读侧放宽为「返回含 profile 轮次的会话，由前端只渲染 profile 轮次」（同一条会话会同时出现在简历与主档两处）；(3) 一次性把混合会话按 scope 拆分迁移成两条会话。三选一需用户拍板，本工单默认保持现状 (1)。

### 已知代价

- 历史混合会话中的 profile 轮次仍不显示，用户观感是「历史主档对话丢失」（数据未删）。
- 服务端 `list_sessions` 需要为每个会话判定轮次 scope，查询复杂度上升；须确认过滤 + limit 的执行顺序与索引（`agent_turns.session_id` 已有索引）。
- 会话层仍然没有用途语义：任何未来的「会话列表按用途分组」需求仍要落回方案 B。

## Non-goals

- 不实现方案 B（不加会话级 `purpose` / `origin` 字段，不做迁移）。
- 不迁移、不删除、不改写任何历史会话或轮次数据（含 `sess_279d28c95bfd`）。
- 不改 `SessionResponse` 的字段与响应形状。
- 不改简历 run 建会话、`POST /turns` 建 profile 轮次的写入语义。
- 不改 `GET /sessions` 无参数时的行为、排序与 limit。
- 不处理历史混合会话的展示 / 迁移（见「待决点」，需用户裁决后另开单）。

## Acceptance Criteria

- [ ] `GET /sessions`（无参数）响应形状、条数上限与排序与改动前完全一致。
- [ ] `GET /sessions?scope=profile` 只返回「至少一条轮次且不含 `scope=resume` 轮次」的会话；含 resume 轮次的混合会话不返回。
- [ ] `GET /sessions?scope=<非法值>` 返回 422，不静默忽略。
- [ ] 过滤发生在 `limit` 之前：主档候选不会被更早的 resume-only 会话挤出结果。
- [ ] 主档助手解析会话只发 1 次 `GET /sessions?scope=profile`，不再对每个候选发 `GET /sessions/{id}/turns`（用 MSW 断言请求次数）。
- [ ] 混合会话（含 profile + resume 轮次）不被采用：助手行为与现状一致，不回退到误采简历会话。
- [ ] 契约文档 `docs/agent/agent-operation-api.md` 记录了新参数与其判定语义。
- [ ] `pytest`（agent 模块）、`pnpm -C ui test`、`archkit inspect .` 通过。

## Implementation

<!-- 待开工后补记：改动文件、DAO 查询写法、测试与文档同步结果。 -->

## Verification

<!-- 待验证后补记：命令与真实输出。 -->

## Related ADRs

- `docs/agent/agent-operation-api.md` §19.1 / §19.2 / §21.1（会话与轮次的作用域契约）
- 相关已关工单：`ee3b5`（主档助手按轮次 scope 选取会话的止血修复）
