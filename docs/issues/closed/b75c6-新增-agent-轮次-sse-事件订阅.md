---
id: b75c6
status: closed
created_at: 2026-09-30T15:20:00.000Z
updated_at: 2026-09-30T15:38:50.261Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-30T15:28:16.999Z
closed_at: 2026-09-30T15:38:50.261Z
---

# 新增 Agent 轮次 SSE 事件订阅

## Background

- backend 目前零流式能力：`StreamingResponse` / `text/event-stream` 在 `backend/app` 无任何使用；agent 模块路由全部是同步 `def`。
- 前端 `ui/src/lib/api.ts:149` 预留了「SSE 在真实实现中用 EventSource」注释，但没有真实 `EventSource` 用法。
- `backend/app/jobs/` 只有 `__init__.py`，`backend/app/tasks/` 只有 `seed.py`：没有 run loop、队列或 worker。因此真实可推的只有持久化的轮次与待办状态，不能造进度/token/步骤事件。
- 本期先补 SSE 基础设施（`StreamingResponse` + 事件帧 + 反缓冲 header + 心跳 + 断连终止），供后续 run loop 复用。

## Scope

- backend：新增 `app/modules/agent/events.py`（事件帧格式化 + 轮询变更检测生成器）；`agent/api.py` 新增 `GET /turns/{turn_id}/events`（权限 `resume:read`）。
- 事件：首帧 `snapshot`（与 `GET /turns/{turn_id}` 同构 JSON）；轮次或待办真实变化时 `turn.updated`；空闲心跳用注释行 `: heartbeat`。
- header：`Content-Type: text/event-stream`、`Cache-Control: no-cache`、`X-Accel-Buffering: no`、`Connection: keep-alive`；首帧前发 `retry: 3000`。
- 前端：新增 `ui/src/lib/turn-events.ts` 的 `subscribeTurnEvents` 与单测（注入 EventSource 工厂）。
- 文档：`docs/agent/agent-operation-api.md` 登记端点与事件契约 + 代理层验证方法；`backend/README.md` 记录验证命令。

## Non-goals

- 不实现 run loop、不调模型、不新建队列/worker。
- 不引入异步 ORM，不改现有同步架构。
- 不推送任何假的进度/token/步骤事件。
- 不改 `getActiveRun` 的 mock，不重构 run-panel。
- 不改审批语义（`require_human_session` 不受影响）。
- 不新增 UI 可见文案，故不动 i18n。

## Acceptance Criteria

- [x] `GET /turns/{turn_id}/events` 返回 200，`Content-Type` 为 `text/event-stream`，header 含 `Cache-Control: no-cache` 与 `X-Accel-Buffering: no`。
- [x] 首帧为 `snapshot`，data 与 `GET /turns/{turn_id}` 同构；无变化时不重复推送。
- [x] 轮次或待办状态真实变化后推出 `turn.updated`，data 为新投影。
- [x] 空闲时按心跳间隔推出 `: heartbeat` 注释行。
- [x] 客户端断开后生成器终止、不再产生新帧，并释放读事务。
- [x] 未知或越权 turn 在建立流之前返回 404 `RESOURCE_NOT_FOUND`；权限码 `resume:read`。
- [x] 前端 `subscribeTurnEvents` 封装 `EventSource`、解析 `snapshot`/`turn.updated`、返回退订函数，并有成功/失败单测。
- [x] 契约文档登记路径/权限/事件/header/断连语义/代理验证方法；`backend/README` 记录验证命令。
- [x] `uv run --directory backend pytest -q`、`pnpm -C ui test`、`archkit inspect .` 通过；真实 `curl -N` 为分块即时，经 Vite proxy 亦为分块即时。

## Implementation

- `backend/app/modules/agent/events.py`（新增）：`format_event` / `format_retry` / `format_heartbeat` 帧格式化，`turn_event_stream` 轮询变更检测生成器（规范化 JSON 投影比较，无变化不推；`db.expire_all()` 让下一 SELECT 看到其它请求的提交）。
- `backend/app/modules/agent/api.py`：新增 `GET /turns/{turn_id}/events`（`require_permission("resume:read")`），返回 `StreamingResponse`（`text/event-stream` + 反缓冲 header）。流建立前先 `service.get_turn` 解析归属，未知/越权 turn 仍是普通 404。
- `backend/app/core/config.py`：新增 `SSE_POLL_INTERVAL_SECONDS`（默认 1）与 `SSE_HEARTBEAT_INTERVAL_SECONDS`（默认 15）。
- `backend/tests/test_agent_events.py`（新增 5 个用例）：端点 transport/header/首帧、真实变更推 `turn.updated`、空闲注释心跳且无假事件、断连后停止、未知 turn 404。
- `ui/src/lib/turn-events.ts`（新增）：`subscribeTurnEvents` / `parseTurnEvent` / `turnEventsUrl`，封装 `EventSource`（`withCredentials`）与事件解析，返回退订函数。
- `ui/src/lib/turn-events.test.ts`（新增 6 个用例）：URL 编码、帧解析与容错、snapshot/turn.updated 分发、open/error 转发、退订清理。
- 文档：契约 §6 端点表 + 新增 §18（端点/header/事件表/断连/客户端/代理验证）、`backend/README.md`（SSE 小节 + 可复现验证命令）、根 `README.md`（能力表、已知边界、端点与测试计数）、`docs/design.md`、Skill `SKILL.md`（§4.12 + 12 端点）与 `README.md`。
- 未实现 run loop / 队列 / worker，未引入异步 ORM，未改 `getActiveRun` mock 与审批语义。

## Verification

红（实现前）：`cd agent-core && uv run pytest -q` 不涉及；后端 `tests/test_agent_events.py` 因 `ImportError: cannot import name events` 整文件报错；前端 `pnpm -C ui test -- turn-events` 报 `Failed to resolve import "@/lib/turn-events"`。

绿：

```console
$ uv run --directory backend pytest -q
176 passed, 4 warnings in 6.33s

$ cd agent-core && uv run pytest -q
70 passed in 0.09s

$ pnpm -C ui test
Test Files  23 passed (23)
     Tests  177 passed (177)

$ archkit inspect .
Quality gates passed.
```

真实流式（隔离库 + uvicorn :8011 + Vite :5174，`SSE_POLL_INTERVAL_SECONDS=0.2`、`SSE_HEARTBEAT_INTERVAL_SECONDS=2`，带相对时间戳）：

```text
直连 :8011                          经 Vite proxy :5174/api
  0.000s retry: 3000                  0.000s retry: 3000
  0.000s event: snapshot              0.000s event: snapshot
  1.036s event: turn.updated          0.824s event: turn.updated   # preview 后
  3.309s : heartbeat                  3.096s : heartbeat
  3.512s event: turn.updated          3.506s event: turn.updated   # approve 后
  5.784s : heartbeat                  5.783s : heartbeat
  8.047s : heartbeat                  8.051s : heartbeat
```

断连释放会话（`pg_stat_activity`，datname=resumate_sse_check）：流中 `idle in transaction x1`；客户端断开后 `idle in transaction` 归零、连接回到 `idle`。

## Related ADRs

- None.
