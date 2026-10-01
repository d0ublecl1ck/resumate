---
id: 83c41
status: closed
created_at: 2026-10-01T04:00:00.000Z
updated_at: 2026-10-01T01:28:37.346Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:25:56.587Z
closed_at: 2026-10-01T01:28:37.346Z
---

# 后端 spawn resumate-agent 运行体端点

## Background

- 决策 1：运行体是独立进程（`resumate-agent` CLI）；后端 spawn 同一个入口，模型调用不在后端内实现。
- 模型密钥保留在后端加密存储（`user_settings.model_config`，Fernet），按 run 临时交给子进程、用完即弃。

## Scope

- 新增 `POST /resumes/{resume_id}/runs`（body: `prompt`、可选 `executionMode` / `sessionId`），权限 `resume:write` + 人类会话。
- 未配置模型（无 apiKey）→ 409 `MODEL_NOT_CONFIGURED`。
- 解密 apiKey 后经**环境变量**传给子进程（不进 argv）；身份用调用方会话 cookie（也走 env）；base-url 指向自身。
- 子进程硬超时（可配置）到点 kill 整个进程组；stdout/stderr 落可配置日志目录；日志不得包含 apiKey/cookie。
- 并发上限（可配置，进程内计数），超限返回 429 `RATE_LIMITED`。
- 返回 202 + 最小响应（不进 turnId）；轮次由子进程创建，前端用既有 `GET /resumes/{id}/turns?state=open` 与 SSE 发现。
- 契约 `docs/agent/agent-operation-api.md` 新增章节；README 端点计数同步。

## Non-goals

- 不做队列/worker、重试、前端接线。
- 不改模型密钥的加密存储方式；不改 approval 语义。
- 不合并回 main。

## Acceptance Criteria

- [x] 用桩可执行文件验证：argv 与 env（apiKey/cookie 走 env）；202 `{status: started}`。
- [x] 未配置模型 → 409 `MODEL_NOT_CONFIGURED`，不 spawn。
- [x] 未知/越权简历 → 404；PAT 来源 → 403。
- [x] 超时 kill 验证（子进程被终止、slot 释放、无僵尸）。
- [x] 并发上限验证（超限 429）。
- [x] 日志不含 apiKey/cookie，且子进程 env 不含后端自身敏感变量（DATABASE_URL / SETTINGS_SECRET_KEY）。
- [x] `UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q` 现有 187 条不退化；`archkit inspect .` 通过。

## Implementation

- `backend/app/modules/agent/runner.py`（新增）：`start_run`（校验简历/会话归属 → 读模型配置 → 占用并发槽 → spawn → 返回）、`_child_command`（非密参走 argv）、`_child_env`（apiKey/cookie 走 env + 最小环境）、`_resolve_model_config`（Fernet 解密）、`_execution_mode`（请求优先，缺省回退账户 nextRunMode）、`_supervise`（超时 SIGKILL 进程组 + wait 回收 + 释放槽）、进程内并发计数与 `active_run_count`。
- `backend/app/core/config.py`：`AGENT_RUNNER_COMMAND`（默认 `resumate-agent`）、`AGENT_RUNNER_TIMEOUT_SECONDS`（默认 300）、`AGENT_RUNNER_LOG_DIR`（默认 `var/agent-runs`）、`AGENT_RUNNER_MAX_CONCURRENT`（默认 2）。
- `backend/app/shared/errors.py`：新增 `MODEL_NOT_CONFIGURED` 与 `ModelNotConfigured`（409）。
- `backend/app/modules/settings/service.py`：新增公开 `decrypt_api_key`（复用既有 Fernet 路径）。
- `backend/app/modules/agent/schemas.py`：`RunStartRequest` / `RunStartResponse`。
- `backend/app/modules/agent/api.py`：`POST /resumes/{resume_id}/runs`（202），`require_permission("resume:write")` + `require_human_session`。
- `.gitignore`：忽略 `/backend/var/`（运行日志）。
- `backend/tests/test_agent_runs.py`（6 条，全部用桩可执行文件）：未配置模型 409；参数与 env（apiKey/cookie 走 env、无后端敏感变量、日志不含密钥）；超时 kill；并发 429；未知简历 404；PAT 403。

## Verification

红（实现前）：`tests/test_agent_runs.py` 因 `ImportError: cannot import name runner` 整文件 collection error。

绿：

```console
$ UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q
193 passed, 4 warnings in 8.42s

$ archkit inspect .
Quality gates passed.
```

基线 187 条，无退化（+6）。

### 安全小节

**子进程能拿到什么 / 生命周期 / 可见性**
- 环境变量：`RESUME_AGENT_CORE_API_KEY`（本次解密的模型密钥）、`RESUME_AGENT_CORE_SESSION_COOKIE`（调用方完整会话 cookie）、`RESUME_AGENT_CORE_SESSION_COOKIE_NAME`、`RESUME_AGENT_CORE_BASE_URL`、`RESUME_AGENT_CORE_MODEL`、可选 `RESUME_AGENT_CORE_PROVIDER_BASE_URL`。
- **不进 argv**（apiKey/cookie 都走 env），因此 `ps` 看不到；不进 SQLite/数据库；不写入后端日志。
- 生命周期 = 子进程生命周期（硬超时上限 300s）；进程退出即随环境销毁，后端不留明文。
- 子进程使用**最小环境**：只给 PATH/LANG/PYTHONUNBUFFERED + 上述变量，**不继承**后端的 `DATABASE_URL` / `SETTINGS_SECRET_KEY`（测试断言）。

**谁能调用**
- 权限 `resume:write` + `require_human_session`：PAT / agent 来源一律 403 `FORBIDDEN`（测试覆盖）。
- 模型密钥只读**调用者本人**的 `user_settings.model_config`（`settings_dao.get_by_owner(db, user.id)`），不存在拿别人 key 触发的问题。

**超时 kill 后的残留**
- `start_new_session=True` + `os.killpg(SIGKILL)` 杀整个进程组（递归子进程一并处理）；守候线程随后 `proc.wait()` 回收，避免僵尸。
- 释放并发槽；不创建临时文件；唯一落盘产物是配置目录下 `<runId>.log`（目录 0700、文件 0600），按需人工清理。

**已知残余风险（未解决）**
- 子进程持有完整会话 cookie（用户级、非按 run 限权）。硬超时内若子进程泄露，可冒充该用户调用 API。更安全的替代是后端签发一次性、短时、按 resume 限权的 run token；本工单按「优先复用既有鉴权」实现，未做 token 签发。

### 并发与超时的明确行为

- 并发：进程内计数上限 `AGENT_RUNNER_MAX_CONCURRENT`（默认 2）；超出**直接 429 `RATE_LIMITED`，不排队**。多 worker 部署时上限是「每 worker」而非全局。
- 超时：`AGENT_RUNNER_TIMEOUT_SECONDS`（默认 300s）到点 SIGKILL 进程组并回收；返回 202 后前端通过 `GET /resumes/{id}/turns?state=open` 与 SSE 观察结果，被杀的 run 不会留下 open 轮次（子进程未 finalize 则轮次可能停在 open，需 UI/后续工单处理）。

## Related ADRs

- None.
