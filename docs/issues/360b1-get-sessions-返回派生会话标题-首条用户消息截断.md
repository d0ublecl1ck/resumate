---
id: 360b1
status: in-progress
created_at: 2026-10-09T16:47:45.982Z
updated_at: 2026-10-09T16:47:57.517Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:47:57.517Z
---

# GET /sessions 返回派生会话标题（首条用户消息截断）

## Background

前端历史会话列表（`ui/src/components/session-history.tsx` 的 `SessionSummary` / `SessionList`）已按 chatbot 形态支持可选 `title` 与 `messageCount`，缺失时兜底「未命名对话」；但后端 `GET /sessions` 至今只返回 `id / createdAt / updatedAt / lastActiveAt`，没有任何人填这两个字段，所以每行都退化成时间。

用户已拍板：标题**派生而非存储**（`agent_sessions` 不新增列、不做迁移），来源是**该会话首条 role=user 的消息正文**。已关闭的 `docs/issues/closed/e5290-历史会话列表按会话呈现-话题标题与时间分组.md` 已给出结论：取首条 `role=user` 消息正文，去除首尾空白后截取 24 个字符，超出加省略号；实现必须用**单条相关子查询**随会话列表一次查出，禁止前端再逐会话拉消息造成 N+1。契约见 `docs/agent/agent-operation-api.md` §19.1（`agent_sessions` / `agent_session_messages` 字段）与 §19.2（`GET /sessions`）。

本轮只落地后端字段与测试；前端消费（抽屉接线）由另一执行者负责。

## Scope

- `backend/app/modules/agent/schemas.py`：`SessionResponse` 新增可选 `title: str | None` 与 `message_count: int | None`；经 `ApiModel` 的 camelCase 别名序列化为 `title` / `messageCount`。
- `backend/app/modules/agent/dao.py`：`list_sessions` 改为**单条 SQL**——会话主查询 + 两个相关标量子查询（首条 `role=user` 的 `content`、该会话消息总数），保持 `owner_id` 过滤、`last_active_at desc, created_at desc` 排序与 `limit` 不变。
- `backend/app/modules/agent/service.py`：`list_sessions` / `_session_response` 增加派生逻辑——content 先归一（`str`，或对象里的 `text` / `content` 字符串，与前端 `sessionMessageText` 口径一致），`trim` 后 ≤24 字符原样、>24 字符取前 24 字加 `…`；空白或无消息回退 `None`。
- `backend/tests/test_agent_sessions.py`：新增标题派生与截断、无消息 / 仅系统消息兜底、**assistant 不当标题来源**的负向断言、多会话顺序与 limit、空库边界。

## Non-goals

- 不新增数据库列、不做迁移（标题派生而非存储）。
- 不改前端 `ui/src/components/session-history.tsx` / `ui/src/lib/types.ts` / `ui/src/lib/api.ts`；本轮也不接线抽屉。
- 不改会话消息写入、幂等语义与 owner 隔离；不改 `POST /sessions` 响应契约（新建会话没有用户消息，`title` 为 `null`）。

## Acceptance Criteria

- [x] 有首条用户消息：`title` = 该消息正文 `trim` 后 ≤24 字符原样，>24 字符取前 24 字加 `…`。
- [x] 无消息 / 仅 system 消息 / 首条用户消息为空白：`title` 为 `null`。
- [x] 负向：assistant / system / tool 消息永不作 `title` 来源（会话只有 assistant 消息时 `title` 为 `null`）。
- [x] `messageCount` = 该会话 `agent_session_messages` 总数（含 system/tool）。
- [x] 多会话顺序（`last_active_at desc`）与 `limit` 不受影响；空库返回 `[]`。
- [x] 一次 `GET /sessions` 只发一条会话列表 SQL（相关子查询随查询下发，无 N+1）。
- [x] `pnpm -C ui test`、`pnpm -C ui exec tsc -b --noEmit`、`node quality-gates/run.js`、`archkit inspect .` 全绿。
- [x] 真实后端（临时端口）`GET /sessions` 返回片段中存在 `title` 派生值。

## Implementation

- `backend/app/modules/agent/schemas.py`：`SessionResponse` 增 `title: str | None = None` 与 `message_count: int | None = None`，经 `ApiModel` 序列化为 `title` / `messageCount`。
- `backend/app/modules/agent/dao.py`：新增 `SessionSummaryRow(NamedTuple)`；`list_sessions` 改为单条 `select(AgentSession, first_user_content, message_count)`——`first_user_content` 是「`role='user'` 按 `seq ASC` 取 1 条」的相关标量子查询，`message_count` 是 `count(id)` 相关标量子查询；owner 过滤、`last_active_at desc, created_at desc` 排序与 `limit` 均不变。
- `backend/app/modules/agent/service.py`：`SESSION_TITLE_MAX_LENGTH = 24`；`_message_text` 归一 content（`str` / `{text}` / `{content}`，与前端 `sessionMessageText` 同口径）；`_derive_session_title` 去首尾空白，≤24 字原样、>24 字取前 24 字加 `…`，空白或无消息回退 `None`；`_session_response` 带 `title` / `message_count`，`list_sessions` 逐行映射，`create_session` 返回 `message_count=0`。
- `backend/tests/test_agent_sessions.py`：新增 9 条测试——首条用户消息派生与 24 字截断（含边界 24/25）、wire/text/plain 三种 content 形态、首尾空白 trim、无消息 / 仅 system / 首条用户消息空白 / 仅 assistant 全部回退 `null`、assistant 与 system 绝不作标题来源、各 role 消息计数、多会话 recent-first 顺序与空库 `[]`、单条 SQL 断言（`before_cursor_execute` 计到 1 条 SELECT）。
- `docs/agent/agent-operation-api.md` §19.1 / §19.2：回写 `GET /sessions` 响应新增派生只读字段 `title`（首条 `role=user` 正文归一、去首尾空白，≤24 字原样、>24 字取前 24 字加 `…`，空白或无用户消息为 `null`）与 `messageCount`（该会话消息总数，含 system/tool），并注明二者不落库、不新增列、无需迁移、随列表一次查出（无 N+1）。

## Verification

```
cd backend && uv run pytest tests/test_agent_sessions.py -q
  -> 15 passed

cd backend && uv run pytest tests/test_agent_sessions.py tests/test_agent_runs.py tests/test_profile_scope.py tests/test_profile_agent_endpoints.py -q
  -> 45 passed（所有 list_sessions 消费方）

pnpm -C ui exec tsc -b --noEmit      -> exit 0
pnpm -C ui test                       -> Test Files 80 passed (80) / Tests 617 passed (617)
node quality-gates/run.js             -> Quality gates passed.
archkit inspect .                     -> Quality gates passed.
```

真实后端（临时库 `resumate_verify_360b1` + 临时端口 4310，未动 8000/5173）：`POST /auth/login` →
`POST /sessions` → `POST /sessions/{id}/messages`（seq=1 role=user 长正文、seq=2 role=assistant）→
`GET /sessions` 返回：

```json
[
  {
    "id": "sess_de3ceefbbbb9",
    "createdAt": "2026-10-10T00:50:38.892162+08:00",
    "updatedAt": "2026-10-10T00:50:38.940379+08:00",
    "lastActiveAt": "2026-10-10T00:50:38.940379+08:00",
    "title": "帮我改一下简历里的项目经历，突出性能优化成果并补…",
    "messageCount": 2
  }
]
```

`len(title) == 25`（24 字 + `…`），且 `title == 正文[:24] + "…"`；assistant 消息正文未进入标题。
验证后已 kill 4310 服务并 `dropdb resumate_verify_360b1`。

文档同步：`docs/agent/agent-operation-api.md` §19.1 / §19.2 已回写 `title` / `messageCount` 的派生口径与「不新增列、无需迁移、无 N+1」，与实现一致；改后重跑 `node quality-gates/run.js` 与 `archkit inspect .` 全绿。

状态：已实现 + 已验证 + 文档已同步。关单由主执行者统一 `archkit issue close 360b1`（当前工作区仍有其他执行者未提交改动，`archkit issue close` 要求 clean worktree 故未在此执行）。

## Related ADRs

- None.
