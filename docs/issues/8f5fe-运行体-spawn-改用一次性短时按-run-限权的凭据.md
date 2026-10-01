---
id: 8f5fe
status: in-progress
created_at: 2026-10-01T02:00:00.000Z
updated_at: 2026-10-01T01:31:37.078Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-10-01T01:31:37.078Z
---

# 运行体 spawn 改用一次性短时按 run 限权的凭据

## Background

`backend/app/modules/agent/runner.py` 的 `_child_env` 把调用方的**完整会话 cookie** 注入子进程环境（83c41 契约 §20.4 与 `.freak` 已登记该残余风险）。硬超时（默认 300s）内若子进程被攻破或环境被读取，攻击者可拿这个用户级凭据调用任意 API。

本 Issue 用**运行凭据（run token）**替代 cookie：一次性/短时、按 run 限权、独立鉴权类型，并能写拒绝审计。

**凭据形态与生命周期（设计口径）**

- 形态：Bearer secret，前缀 `rsm_run_`（与 PAT 的 `rsm_pat_` 区分），Redis 只存 SHA-256，键 `agent:run_token:<sha256>`，值 `{ownerId, resumeId, runId, expiresAt, maxUses}`。
- 绑定：`(owner_id, resume_id, run_id, expiresAt)`；TTL = `AGENT_RUNNER_TIMEOUT_SECONDS + 120s`（硬超时之外留一点收尾余量）。
- 使用次数：**有限次**（默认上限 1000，`AGENT_RUNNER_TOKEN_MAX_USES`）。理由：一次 run 会发起大量 API 调用（建轮次、工具、checkpoint、会话消息），严格一次性会让正常运行直接失败；因此边界由「TTL + 次数上限 + 进程退出即撤销」三者共同给出。
- 撤销：子进程被回收（正常退出/超时 SIGKILL）时后端删除凭据；TTL 是后端先挂掉时的兜底。
- 越权：只允许运行体真正需要的端点（建轮次、读工作副本、读写 checkpoint、patch 预演/应用、finalize/cancel、会话消息、能力发现）；其余端点一律 403 并写 `run_token_scope` 审计。
- 人类动作：`/pending-actions/{id}/approve|reject` **不**由 scope 拦，而是继续落到 `require_human_session`，由它拒绝并写 `run_human_session` 审计——保持 e9ad6 的语义，不让 run 凭据重新打开自我审批路径。
- 复用绑定：`/resumes/{id}/...` 直接用路径里的 resume；`/turns/{id}/...` 通过该轮次的 `resume_id` 校验；不匹配即 403 + 审计。
- 过期/已用完/未知：401 或 403，且写 `run_token_auth` 审计（与既有 PAT 拒绝审计同一张表）。

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

- [ ] 过期或未知的 run 凭据 -> 401，并写入 `run_token_auth` denied 审计。
- [ ] 超出使用上限 -> 403，凭据随即被撤销，并写入 `run_token_auth` denied 审计。
- [ ] 用 run 凭据访问别的 resume -> 403，并写入 `run_token_scope` denied 审计。
- [ ] 用 run 凭据访问不属于运行体的端点 -> 403，并写入 `run_token_scope` denied 审计。
- [ ] 用 run 凭据 approve / reject -> 403，并写入 `run_human_session` denied 审计，待办保持 pending。
- [ ] run 凭据能建轮次、读工作副本、读写 checkpoint；请求体里的 `executionMode` 被忽略（服务端解析），轮次 source 固定 `agent`。
- [ ] `POST /resumes/{id}/runs` 注入的是 `RESUME_AGENT_CORE_TOKEN`，子进程环境里没有 cookie 变量；子进程退出后该凭据立即失效。
- [ ] 子进程日志/错误不出现该凭据。
- [ ] `UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q` 不退化（现有 193 条）；`archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
