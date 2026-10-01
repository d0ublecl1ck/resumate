---
id: 8f5fe
status: closed
created_at: 2026-10-01T02:00:00.000Z
updated_at: 2026-10-01T01:34:53.333Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-10-01T01:31:37.078Z
closed_at: 2026-10-01T01:34:53.333Z
---

# 运行体 spawn 改用一次性短时按 run 限权的凭据

## Background

`backend/app/modules/agent/runner.py` 的 `_child_env` 把调用方的**完整会话 cookie** 注入子进程环境（83c41 契约 §20.4 与 `.freak` 已登记该残余风险）。硬超时（默认 300s）内若子进程被攻破或环境被读取，攻击者可拿这个用户级凭据调用任意 API。

本 Issue 用**运行凭据（run token）**替代 cookie：短时、按 run 限权、独立鉴权类型，并能写拒绝审计。

**凭据形态与生命周期（设计口径）**

- 形态：Bearer secret，前缀 `rsm_run_`（与 PAT 的 `rsm_pat_` 区分），Redis 只存 SHA-256，键 `agent:run_token:<sha256>`，值 `{ownerId, resumeId, runId, expiresAt, maxUses}`。
- 绑定：`(owner_id, resume_id, run_id, expiresAt)`；TTL = `AGENT_RUNNER_TIMEOUT_SECONDS + AGENT_RUNNER_TOKEN_SLACK_SECONDS`（默认 300s + 120s）。
- 使用次数：**有限次**（`AGENT_RUNNER_TOKEN_MAX_USES`，默认 1000）。理由：一次 run 会发起大量 API 调用（建轮次、工具、checkpoint、会话消息），严格一次性会让正常运行直接失败；边界由「TTL + 次数上限 + 进程退出即撤销」三者共同给出。
- 撤销：子进程被回收（正常退出或超时 SIGKILL）时后端删除凭据；TTL 是后端先挂掉时的兜底。
- 越权：只允许运行体真正需要的端点；其余一律 403 并写 `run_token_scope` 审计；`/resumes/{id}/...` 直接用路径 resume，`/turns/{id}/...` 通过轮次的 `resume_id` 校验，不匹配同样 403 + 审计。
- 人类动作：`/pending-actions/{id}/approve|reject` **不**由 scope 拦截，而是继续落到 `require_human_session`，由它拒绝并写 `run_human_session` 审计——保持 e9ad6 的语义，不让 run 凭据重新打开自我审批路径。
- 过期 / 未知 / 用尽：401 或 403，并写 `run_token_auth` 审计（与 PAT 拒绝审计同一张表）。

## Scope

1. 新增 `backend/app/modules/agent/run_token.py`：Redis 凭据存储（签发 / 查询 / 计数 / 撤销）+ 端点白名单与 resume 绑定规则。
2. `auth/deps.py`：新增 `run` 鉴权类型（Bearer `rsm_run_` 前缀），命中白名单与 resume 绑定后才放行；拒绝时写审计；`require_human_session` 改为拒绝一切非 `session` 的凭据（PAT 保持原有 purpose，run 用 `run_human_session`）。
3. `core/deps.py`：`CurrentUser` 增加 `run_id`。
4. `agent/runner.py`：签发 run token 注入 `RESUME_AGENT_CORE_TOKEN`，不再注入任何 cookie 变量；进程回收时撤销；凭据不进 argv、不进日志、不进错误。
5. `agent/service.py`：只有人类会话可以用请求体指定 `executionMode`；run 与 PAT 一样由服务端解析模式，并且 run 来源固定为 `agent`。
6. `agent/api.py`：run-start 端点注入 Redis 依赖。
7. 契约 §20.2 / §20.4 与 `.freak` 同步，把 83c41 的残余风险标为已处理。

## Non-goals

- 不实现 run 级配额/计费，不做凭据轮换、不做 mTLS/进程隔离等更强隔离。
- 不改前端与 agent-core 协议：agent-core 的 `RESUME_AGENT_CORE_TOKEN` Bearer 通道已存在，直接复用。
- 不改 PAT 的既有语义与审计 purpose。
- 不引入数据库迁移（凭据落在 Redis，与 session/verification 一致）。

## Acceptance Criteria

- [x] 过期或未知的 run 凭据 -> 401，并写入 `run_token_auth` denied 审计。
- [x] 超出使用上限 -> 403，凭据随即被撤销，并写入 `run_token_auth` denied 审计。
- [x] 用 run 凭据访问别的 resume -> 403，并写入 `run_token_scope` denied 审计。
- [x] 用 run 凭据访问不属于运行体的端点 -> 403，并写入 `run_token_scope` denied 审计。
- [x] 用 run 凭据 approve / reject -> 403，并写入 `run_human_session` denied 审计，待办保持 pending。
- [x] run 凭据能建轮次、读工作副本、读写 checkpoint；请求体里的 `executionMode`/`source` 被忽略，轮次固定 `approval` + `agent`。
- [x] `POST /resumes/{id}/runs` 注入的是 `RESUME_AGENT_CORE_TOKEN`，子进程环境里没有 cookie 变量；子进程退出后该凭据立即从存储中消失。
- [x] 子进程日志不出现该凭据（测试断言）。
- [x] `UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q` 不退化（原 193 → 现 200 passed）；`archkit inspect .` 通过。

## Implementation

- `agent/run_token.py`（新增）：`RUN_TOKEN_PREFIX = "rsm_run_"`；`issue_run_token` / `lookup_run_token` / `register_use`（Redis INCR + 继承 token TTL）/ `revoke_run_token`（best effort，Redis 异常不炸守候线程）；`RunCredential` dataclass；`_ALLOWED_ENDPOINTS` 白名单（能力发现、建轮次、工作副本、轮次读取、pending-actions 读取、state 读写、patch 校验/预演/应用、finalize/cancel、会话读写）；`is_human_only_path` / `endpoint_allowed` / `path_resume_id` / `path_turn_id`。
- `auth/deps.py`：`_record_pat_log` 更名 `_record_auth_log`（通用凭据审计）；新增 `run_token_auth` / `run_token_scope` / `run_human_session` purpose；`_authenticate_run_token`（未知/过期/用尽/封禁/越权分别处理并审计，用尽时立即 revoke）；`_enforce_run_scope`（human-only 路径放行给人类门禁，其余查白名单与 resume 绑定）；`get_current_user` 按 Bearer 前缀分流；`require_human_session` 由「等于 pat 才拒」改为「非 session 全拒」。
- `agent/runner.py`：新增 `_ACTIVE_TOKENS`（run_id → (secret, redis)），`_release_slot` 回收时 revoke；`start_run` 增加 `client` 参数，先占并发槽再签发凭据，`Popen` 失败时回滚释放（含撤销）；`_child_env` 去掉 cookie 变量、改注 `RESUME_AGENT_CORE_TOKEN`。
- `agent/service.py`：`_resolve_mode` 只信任 `auth_kind == "session"` 的显式 mode；`begin_turn` 把 `run` 与 `pat` 同样处理（固定 clientId 来源与 `source="agent"`）。
- `core/deps.py` 增加 `CurrentUser.run_id`；`core/config.py` 增加 `agent_runner_token_slack_seconds` 与 `agent_runner_token_max_uses`；`agent/api.py` 注入 `get_redis`。
- 测试：新增 `tests/test_run_token.py`（7 条：正向驱动自己的 resume、越权 resume、越权端点、过期、未知、用尽后撤销、无法 approve/reject）；更新 `tests/test_agent_runs.py` 的环境断言（token 前缀、无 cookie 变量、日志无凭据、回收后存储为空）。

## Verification

TDD 红灯（实现前）：

```
UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest tests/test_run_token.py -q
→ ERROR tests/test_run_token.py（ModuleNotFoundError: app.modules.agent.run_token）
```

全量：

```
UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q
→ 200 passed, 4 warnings in 9.72s（原有 193 条未退化）

archkit inspect .
→ Quality gates passed.
```

关键断言的语义（测试内已断言）：

- 用 run 凭据建轮次时请求体传 `executionMode: "full_access", source: "client"`，返回的轮次仍是 `executionMode=approval` / `modeSource=account` / `source=agent`。
- approve 与 reject 各被拒一次后，`GET /turns/{id}/pending-actions` 里该待办仍是 `pending`，审计里出现两条 `run_human_session` denied。
- 用尽上限后同一条凭据立刻变成「未知」：再调用返回 401 `UNAUTHENTICATED`。
- 子进程回收后 `_ACTIVE_TOKENS` 为空且 Redis 里对应 key 已删除。

## Related ADRs

- None.
