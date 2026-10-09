---
id: 3ff68
status: in-progress
created_at: 2026-10-09T16:03:03.680Z
updated_at: 2026-10-09T16:03:12.206Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:03:12.206Z
---

# 启动自检校验有效配置：缺 SMTP 立即失败并输出配置来源

## Background

后端启动时不校验配置，等到运行期才在后台任务里发现配置缺失，表现为「进程正常启动、`/health/` 返回 200，但功能是坏的」。2026-10-09 的真实事故：用 `git worktree` 起后端，而 `.env` 是未跟踪文件（`backend/.gitignore` 忽略 `.env`），worktree 里没有它；进程照常启动，SMTP 配置为空，忘记密码在后台任务里抛 `RuntimeError: SMTP 未配置：请设置 SMTP_HOST 与 SMTP_FROM_EMAIL`，接口却仍返回 `202 reset_sent`，用户白等邮件。

判定标准必须是「有效配置是否齐备」而不是「.env 文件是否存在」：CI、pytest、Docker/Compose 都合法地通过真实环境变量提供配置，容器里根本没有 `.env`。

## Scope

- `backend/app/core/config.py`：新增启动自检 `check_startup_config(settings)`、`StartupConfigError`、`env_file_path()` 与逃生阀判定 `allow_missing_env()`。
- `backend/app/main.py`：用 FastAPI lifespan 在启动生命周期调用自检，失败即中止启动。
- `backend/tests/test_startup_config.py`：新增自检单测；`backend/tests/conftest.py` 设置逃生阀，保证 pytest 在无 `.env` 的 CI 上仍全绿。
- `backend/.env.example` 与 `README.md` 本地启动段：同步 SMTP 段说明、启动自检行为与「worktree 不会带 `.env`，需要手动复制」提示。

## Non-goals

- 不改 `backend/app/modules/auth/**`（另一个子代理正在修忘记密码的诚实性缺陷），也不改 `backend/app/modules/auth/mailer.py` 的运行期报错；本 issue 只做启动期拦截。
- 不改 `compose.yaml`、`docker/**`、`ui/**`、`docs/competition/**`、`docs/design.md`。
- 不校验数据库、Redis 等基础设施连通性，只校验 SMTP 这一组「缺了就静默坏功能」的配置。

## Acceptance Criteria

- [x] 启动自检在 FastAPI lifespan 中执行，日志打印配置来源：`.env` 是否存在（绝对路径，从进程工作目录推导）、哪些关键项来自真实环境变量；不打印任何密码/密钥取值。
- [x] `SMTP_HOST` 有值但 `SMTP_FROM_EMAIL` 为空，或认证凭据（`SMTP_USERNAME`/`SMTP_PASSWORD`）只配一半时，启动失败，报错点名缺失的键。
- [x] `SMTP_HOST` 为空（完全未配置 SMTP）时默认启动失败；报错包含期望 `.env` 绝对路径与「worktree 不会带过来未跟踪的 `.env`，需要手动复制」提示。
- [x] 设置 `RESUMATE_ALLOW_MISSING_ENV=1` 时，完全未配置 SMTP 降级为一条醒目 WARNING，直白写明「已按 RESUMATE_ALLOW_MISSING_ENV 放行，邮件功能不可用」。
- [x] 逃生阀只放行「完全未配置 SMTP」；半配置（缺 `SMTP_FROM_EMAIL` 或认证凭据只配一半）仍然启动失败。
- [x] 报错文案与仓库内测试断言均不含本机绝对家目录路径，期望路径在运行期从进程工作目录推导，测试只断言其形态（绝对路径且以 `.env` 结尾）。
- [x] `cd backend && .venv/bin/python -m pytest -q` 全绿；conftest 设置逃生阀的原因写在实现说明里。
- [x] `node quality-gates/run.js` 与 `archkit inspect .` 通过。

## Implementation

- `backend/app/core/config.py`：新增 `StartupConfigError`、`env_file_path()`（从进程工作目录推导 `.env` 绝对路径）、`allow_missing_env()`、`_log_config_sources()`、`_smtp_problems()`、`check_startup_config()`。判定规则：
  - `SMTP_HOST` 有值但 `SMTP_FROM_EMAIL` 为空 → 失败，报错点名 `SMTP_FROM_EMAIL`；
  - `SMTP_USERNAME` 与 `SMTP_PASSWORD` 只配一半 → 失败，报错点名缺失的那一个；
  - 以上半配置一律失败，逃生阀不放行；
  - `SMTP_HOST` 为空（完全未配置）→ 默认失败；`RESUMATE_ALLOW_MISSING_ENV` 取 `1/true/yes/on` 时降级为 WARNING 并放行；
  - 三条路径都先打印配置来源：`.env` 是否存在（绝对路径）、关键项来自进程环境变量还是 `.env`/默认值；只打印键名，任何取值（含密码/密钥）都不打印。
- `backend/app/main.py`：FastAPI `lifespan` 依次调用 `_ensure_startup_logging()` 与 `check_startup_config()`。`_ensure_startup_logging()` 用 `logging.basicConfig` 给根 logger 补一个 handler——uvicorn 默认只给 `uvicorn*` logger 挂 handler，应用 logger 的 INFO 会被静默丢弃；`basicConfig` 在已存在 handler（pytest caplog、部署方日志配置）时是空操作。
- `backend/tests/test_startup_config.py`：9 个用例覆盖缺 `.env` 失败、半配置失败、认证凭据半配失败、逃生阀放行并 WARNING、完整配置不泄漏取值、环境变量来源、lifespan 接线、`env_file_path()` 形态（绝对路径且以 `.env` 结尾）。
- `backend/tests/conftest.py`：在导入 `app.main` 前 `os.environ.setdefault("RESUMATE_ALLOW_MISSING_ENV", "1")`。原因：测试用依赖覆盖把真实 SMTP 换成内存 fake mailer，CI 上也没有 `backend/.env`；不设逃生阀时所有走 lifespan 的用例都会卡在启动自检。自检自身的行为由 `test_startup_config.py` 独立断言，不依赖这个默认值。
- `backend/.env.example`：SMTP 段与 `PUBLIC_WEB_BASE_URL` 保持完整，新增启动自检行为说明与「worktree 不会带 .env，需要手动复制」提示。
- `README.md` 快速开始：补同样的 worktree 提示，以及自检/逃生阀说明。

## Verification

临时目录路径已脱敏为 `<tmpdir>`，仓库路径脱敏为 `<worktree>`。

### 1) 缺 .env 且未设逃生阀 → 启动失败

命令：在无 `.env` 的临时目录执行 `PYTHONPATH=<worktree>/backend <worktree>/backend/.venv/bin/python -m uvicorn app.main:app --port 8002`，不设 `RESUMATE_ALLOW_MISSING_ENV`。

```text
EXIT_CODE=3
INFO:     [配置自检] .env 文件：不存在（期望路径 <tmpdir>/.env）
INFO:     [配置自检] 来自进程环境变量的关键项：（无）
INFO:     [配置自检] 取自 .env 文件或代码默认值的关键项：DATABASE_URL、REDIS_URL、SETTINGS_SECRET_KEY、PUBLIC_WEB_BASE_URL、SMTP_HOST、SMTP_PORT、SMTP_FROM_EMAIL、SMTP_USERNAME、SMTP_PASSWORD
ERROR:     [配置自检] 启动配置自检失败：SMTP 未配置（SMTP_HOST 为空），邮箱验证与忘记密码发信都会在运行期失败，因此拒绝启动。
请在 <tmpdir>/.env 中设置 SMTP_HOST 与 SMTP_FROM_EMAIL（需要认证时再设置 SMTP_USERNAME 与 SMTP_PASSWORD），或通过进程环境变量提供。
提示：worktree 不会带过来未跟踪的 .env，需要手动复制（从主工作区复制到 <tmpdir>/.env）。
如需在 pytest / CI / 无邮件需求的本地场景启动，设置 RESUMATE_ALLOW_MISSING_ENV=1 放行（邮件相关功能不可用）。
app.core.config.StartupConfigError: 启动配置自检失败：SMTP 未配置（SMTP_HOST 为空）...
ERROR:    Application startup failed. Exiting.
```

### 2) 缺 .env 且设 `RESUMATE_ALLOW_MISSING_ENV=1` → 启动成功并 WARNING

```text
INFO:     [配置自检] .env 文件：不存在（期望路径 <tmpdir>/.env）
WARNING:     [配置自检] 已按 RESUMATE_ALLOW_MISSING_ENV 放行：SMTP_HOST 为空，邮件相关功能不可用（邮箱验证与忘记密码发信都会失败）。
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8002 (Press CTRL+C to quit)
PROCESS_STATE=RUNNING (startup succeeded with escape hatch)
port 8002 free after cleanup
```

### 3) 有完整 .env（复制主工作区 backend/.env 到临时目录）→ 启动成功，日志显示来源

```text
INFO:     [配置自检] .env 文件：存在（<tmpdir>/.env）
INFO:     [配置自检] 来自进程环境变量的关键项：（无）
INFO:     [配置自检] 取自 .env 文件或代码默认值的关键项：DATABASE_URL、REDIS_URL、SETTINGS_SECRET_KEY、PUBLIC_WEB_BASE_URL、SMTP_HOST、SMTP_PORT、SMTP_FROM_EMAIL、SMTP_USERNAME、SMTP_PASSWORD
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8002 (Press CTRL+C to quit)
PROCESS_STATE=RUNNING (startup succeeded)
port 8002 free after cleanup
```

日志只出现键名，没有任何密码/密钥取值；`test_configured_smtp_logs_sources_without_leaking_values` 断言 secret 不出现在日志中。

### 4) 半配置（有 SMTP_HOST、无 SMTP_FROM_EMAIL）→ 启动失败，点名 SMTP_FROM_EMAIL

```text
--- case A: 半配置，未设逃生阀 ---
EXIT_CODE_A=3
ERROR:     [配置自检] 启动配置自检失败：SMTP 配置不完整，缺少 SMTP_FROM_EMAIL。请在 <tmpdir>/.env 中补齐这些键（需要认证时同时设置 SMTP_USERNAME 与 SMTP_PASSWORD），或通过进程环境变量提供。
app.core.config.StartupConfigError: 启动配置自检失败：SMTP 配置不完整，缺少 SMTP_FROM_EMAIL。...
ERROR:    Application startup failed. Exiting.
--- case B: 半配置，设置逃生阀 RESUMATE_ALLOW_MISSING_ENV=1 ---
EXIT_CODE_B=3
ERROR:     [配置自检] 启动配置自检失败：SMTP 配置不完整，缺少 SMTP_FROM_EMAIL。...
```

### 5) pytest 全绿

并发检查：`pgrep -fl pytest` 输出 `no pytest running`。

```text
.venv/bin/python -m pytest -q
547 passed, 4 warnings in 19.53s
```

### 6) 质量门禁

```text
$ node quality-gates/run.js
Quality gates passed.
$ archkit inspect .
Quality gates passed.
```

## Related ADRs

- None.
