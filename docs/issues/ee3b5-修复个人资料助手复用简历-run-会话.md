---
id: ee3b5
status: in-progress
created_at: 2026-10-07T10:09:23.823Z
updated_at: 2026-10-07T10:09:39.622Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-10-07T10:09:39.622Z
---

# 修复个人资料助手复用简历 run 会话

## Background

`/profile` 的「对话维护资料」助手把账号里「最近活跃会话」当作主档会话（`ui/src/components/profile-assistant.tsx:116` 取 `sessions[0]`，`:176-177` 提交时同样取 `existing[0]`），完全不看轮次 scope。先发起一次简历 run 会创建一个含 `scope=resume` 轮次的会话；再打开主档助手会直接采用它，于是主档面板里显示简历 run 的对话（如「请把简历 res_… 的一句话头衔改成…」），并且新的 profile run 会被写进同一个已经含 resume 轮次的会话。

契约 `docs/agent/agent-operation-api.md` §21.1 明确：会话只绑 owner，一个会话可以横跨多份简历与主档，scope 是轮次属性、不是会话属性；`GET /sessions` 的 `SessionResponse` 也没有 scope 字段，`GET /sessions/{id}/turns` 返回该会话的全部轮次（含 resume）。因此「主档会话」不是服务端概念，只能由前端按轮次 scope 判定。

## Scope

- 前端在候选中只采用「至少有一条 profile 轮次，且所有轮次都是 profile 作用域」的会话；没有这样的会话时新建，绝不退回复用最近一条。
- 提交路径遵守同一规则：不允许把 profile run 落到含 resume 轮次的会话。
- 测试覆盖：最新会话含 resume 轮次而存在更老的 profile 会话时采用 profile 会话；只有含 resume 轮次的会话时新建；面板不渲染 resume 会话消息。

## Non-goals

- 不改后端 `GET /sessions` 契约：不新增 `?scope=` 查询参数，不改 `SessionResponse`，不动数据库。
- 不迁移已经混过 scope 的历史会话。
- 不改任何文案键。

## Acceptance Criteria

- [ ] 最新会话只含 resume 轮次而存在更老的 profile 会话时，助手采用 profile 会话，不展示 resume 会话消息
- [ ] 只有含 resume 轮次的会话时，助手新建会话，不向该会话起 profile run
- [ ] 助手面板不渲染简历 run 的对话文本
- [ ] `pnpm -C ui test` 通过

## Implementation

- `ui/src/components/profile-assistant.tsx`：把「最近活跃会话」换成 `["profile-session"]` 解析器——遍历 `GET /sessions`，对每个候选调用 `GET /sessions/{id}/turns`，只返回「至少有一条轮次且所有轮次 `scope=profile`」的会话，否则返回 `null`；`sessionId = createdSessionId ?? profileSessionQuery.data ?? null`。
- 提交路径：`sessionId` 为空时直接 `createSession()` 新建，不再回退 `existing[0]`；起 run 后失效 `["profile-session"]`。
- 防御：用于渲染的 `turns` 过滤掉 `scope=resume`，避免已采用的会话后来被简历 run 污染时仍在主档面板渲染简历轮次。
- 测试：`ui/src/components/profile-assistant.test.tsx` 新增两条（最新会话含 resume 轮次时改用 profile 会话；只有 resume 会话时新建、不向它起 run）；两条既有错误码用例的会话轮次 mock 由 `[]` 改为 profile 轮次（让它们仍能采用 `sess_1`）；StrictMode 用例改播种 `["profile-session"]`。
- 取舍：契约 §21.1 规定会话可横跨简历与主档，故「主档会话」只能在客户端按轮次 scope 判定；没有改后端 `GET /sessions` 契约（未新增 `?scope=`）。副作用：已被混入 resume 轮次的历史会话（如 `sess_279d28c95bfd`）会被整体排除，其中的 profile 轮次不再显示，数据未迁移。

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
