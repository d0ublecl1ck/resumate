---
id: 19e5d
status: closed
created_at: 2026-10-09T16:11:14.708Z
updated_at: 2026-10-09T16:14:11.829Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:11:27.620Z
closed_at: 2026-10-09T16:14:11.829Z
---

# 修复 compose 容器启动：透传 SMTP 环境变量并显式设置本地逃生阀

## Background

`0552006`/`3ff68` 给后端加了启动自检：`SMTP_HOST` 为空时默认拒绝启动，只有 `RESUMATE_ALLOW_MISSING_ENV ∈ {1,true,yes,on}` 才降级为 WARNING 放行。但 `compose.yaml` 既没有把 SMTP 变量传进 backend 容器，也没有设置逃生阀，于是 `docker compose up` 的 backend 会在 FastAPI lifespan 自检阶段抛 `StartupConfigError` 直接退出。这是 3ff68 关单时明确记录的残留风险（`.freak` 第 41 条）。

修复目标不是放松规则，而是把「本地/demo 容器」这条路径显式、可见地配好：真实 SMTP 从宿主环境或仓库根 `.env` 透传进容器，同时给本地 compose 一个写在明处的默认逃生阀。

## Scope

- `compose.yaml`：backend 服务透传 `SMTP_*`，并显式设定 `RESUMATE_ALLOW_MISSING_ENV` 的默认值，附说明注释。
- `backend/.env.example`：补齐 SMTP 键与三条口径（缺 SMTP 拒绝启动 / 逃生阀用法 / compose 默认）。
- `README.md` 的 Docker 与本地启动章节：同步同样的三条口径。
- `backend/tests/**`：与 compose 契约有关时补守卫测试（仅当能稳定断言 compose 行为）。

## Non-goals

- 不改 `backend/app/core/config.py` 与 `backend/app/main.py` 的自检逻辑（`3ff68` 已关单，要改需先报告）。
- 不改 `ui/**`、`docs/competition/**`、`docs/design.md`。
- 不把任何 SMTP 密钥/密码字面值写进 `compose.yaml` 或任何被跟踪文件。
- 不引入新的 compose profile 或多环境编排。

## Acceptance Criteria

- [x] `compose.yaml` 的 backend 服务把 `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD`/`SMTP_FROM_EMAIL`/`SMTP_STARTTLS` 从宿主环境或仓库根 `.env` 透传，缺省为空；文件内无任何密钥字面值。
- [x] backend 服务显式设置 `RESUMATE_ALLOW_MISSING_ENV` 默认 `1`，并在同一处注释说明「本地 compose 默认禁用邮件功能；生产必须提供 SMTP_* 且不要设该变量」。
- [x] 只有 backend 服务需要该逃生阀；postgres/redis/ui 不设。
- [x] 注入完整 SMTP 时启动成功且日志无 WARNING；不提供 SMTP 且逃生阀生效时启动成功且日志出现放行 WARNING。
- [x] `README.md` 的 Docker/本地启动章节与 `backend/.env.example` 写清三条：缺 SMTP 会拒绝启动、逃生阀怎么用、compose 默认怎么走。
- [x] `node quality-gates/run.js` 与 `archkit inspect .` 通过。

## Implementation

- `compose.yaml`：backend 服务的 `environment` 在既有四项之后新增六个 SMTP 透传键（`SMTP_HOST: ${SMTP_HOST:-}`、`SMTP_PORT: ${SMTP_PORT:-587}`、`SMTP_USERNAME: ${SMTP_USERNAME:-}`、`SMTP_PASSWORD: ${SMTP_PASSWORD:-}`、`SMTP_FROM_EMAIL: ${SMTP_FROM_EMAIL:-}`、`SMTP_STARTTLS: ${SMTP_STARTTLS:-true}`）与 `RESUMATE_ALLOW_MISSING_ENV: ${RESUMATE_ALLOW_MISSING_ENV:-1}`。透传来源是宿主环境或仓库根 `.env`（compose 的变量替换只读这两个来源，不读 `backend/.env`）；文件内不出现任何 SMTP 取值，注释明确「禁止在本文件写任何 SMTP 密钥/密码字面值」。逃生阀只加在 backend 服务，postgres / redis / ui 不动。
- 逃生阀注释写明生产契约：生产必须提供完整 `SMTP_*`，并显式设 `RESUMATE_ALLOW_MISSING_ENV=0`（或删掉该行），让缺配置直接拒绝启动；本地 / demo 默认禁用邮件功能。
- `backend/tests/test_compose_contract.py`：4 个契约用例，只读解析 `compose.yaml` 文本（项目栈无 PyYAML，不新增依赖）——断言六个 SMTP 键以 `${VAR:-default}` 形态透传、逃生阀默认为 `1`、注释点名生产与 SMTP、逃生阀与 `SMTP_*` 只出现在 backend 服务。按 TDD 先写测试：改动 compose 前 3 failed / 1 passed，改后 4 passed。
- `backend/.env.example`：在 SMTP 段后补 Docker Compose 说明（默认逃生阀、透传来源、生产要求）。
- `README.md`「容器一条命令」：补一段容器启动自检口径——缺 SMTP 会拒绝启动、compose 默认给 backend 设 `RESUMATE_ALLOW_MISSING_ENV=1`、真发信要写仓库根 `.env` 或宿主环境、生产要设 `0`。
- `backend/app/core/config.py` 与 `backend/app/main.py` 未改（Non-goals）。

## Verification

路径已脱敏：仓库根记为 `<worktree>`，临时目录记为 `<tmpdir>`。本机 Docker daemon 未运行（`docker version` 无法连接 socket），无法真正 `docker compose up`；`docker compose config` 是纯客户端渲染，不依赖 daemon，仍可用。两路径按任务约定用 compose 会注入的环境变量在临时端口（8003/8004）本地等价复现。

### 1) 修复前复现：compose 注入的环境 + 无逃生阀 → 启动失败

在无 `.env` 的临时目录执行 `PYTHONPATH=<worktree>/backend <worktree>/backend/.venv/bin/python -m uvicorn app.main:app --port 8003`，环境变量取 `docker compose config` 给 backend 注入的四项，且不设 `RESUMATE_ALLOW_MISSING_ENV`：

```text
INFO:     [配置自检] .env 文件：不存在（期望路径 <tmpdir>/.env）
INFO:     [配置自检] 来自进程环境变量的关键项：DATABASE_URL、REDIS_URL、SETTINGS_SECRET_KEY、PUBLIC_WEB_BASE_URL
INFO:     [配置自检] 取自 .env 文件或代码默认值的关键项：SMTP_HOST、SMTP_PORT、SMTP_FROM_EMAIL、SMTP_USERNAME、SMTP_PASSWORD
ERROR:     [配置自检] 启动配置自检失败：SMTP 未配置（SMTP_HOST 为空），邮箱验证与忘记密码发信都会在运行期失败，因此拒绝启动。
ERROR:    Application startup failed. Exiting.
EXIT=3
```

### 2) `docker compose config`：修复后的最终注入环境

```text
$ docker compose config | sed -n '/^  backend:/,/^  postgres:/p'
    environment:
      DATABASE_URL: postgresql+psycopg://resumate:resumate@postgres:5432/resumate
      PUBLIC_WEB_BASE_URL: http://localhost:8081
      REDIS_URL: redis://redis:6379/0
      RESUMATE_ALLOW_MISSING_ENV: "1"
      SETTINGS_SECRET_KEY: resumate-local-dev-secret
      SMTP_FROM_EMAIL: ""
      SMTP_HOST: ""
      SMTP_PASSWORD: ""
      SMTP_PORT: "587"
      SMTP_STARTTLS: "true"
      SMTP_USERNAME: ""
```

宿主环境有值时按值注入（示例为占位值，非真实密钥）：

```text
$ SMTP_HOST=smtp.example.com SMTP_FROM_EMAIL=noreply@example.com docker compose config | grep SMTP_
      SMTP_FROM_EMAIL: noreply@example.com
      SMTP_HOST: smtp.example.com
      SMTP_PASSWORD: ""
      SMTP_PORT: "587"
      SMTP_STARTTLS: "true"
      SMTP_USERNAME: ""
```

### 3) 路径 B：不提供 SMTP + 逃生阀生效 → 启动成功且有 WARNING

```text
$ (cd <tmpdir> && RESUMATE_ALLOW_MISSING_ENV=1 PYTHONPATH=<worktree>/backend ... python -m uvicorn app.main:app --port 8003)
PROCESS_STATE=RUNNING (startup succeeded)
--- WARNING lines: 1 ---
INFO:     [配置自检] .env 文件：不存在（期望路径 <tmpdir>/.env）
INFO:     [配置自检] 来自进程环境变量的关键项：DATABASE_URL、REDIS_URL、SETTINGS_SECRET_KEY、PUBLIC_WEB_BASE_URL
INFO:     [配置自检] 取自 .env 文件或代码默认值的关键项：SMTP_HOST、SMTP_PORT、SMTP_FROM_EMAIL、SMTP_USERNAME、SMTP_PASSWORD
WARNING:     [配置自检] 已按 RESUMATE_ALLOW_MISSING_ENV 放行：SMTP_HOST 为空，邮件相关功能不可用（邮箱验证与忘记密码发信都会失败）。
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8003 (Press CTRL+C to quit)
```

### 4) 路径 A：提供完整 SMTP → 启动成功且无 WARNING

```text
$ (cd <tmpdir> && SMTP_HOST=smtp.example.com SMTP_PORT=587 SMTP_USERNAME=mailer SMTP_PASSWORD=<占位密码> SMTP_FROM_EMAIL=noreply@example.com python -m uvicorn app.main:app --port 8004)
PROCESS_STATE=RUNNING (startup succeeded)
--- WARNING lines: 0 ---
INFO:     [配置自检] .env 文件：不存在（期望路径 <tmpdir>/.env）
INFO:     [配置自检] 来自进程环境变量的关键项：DATABASE_URL、REDIS_URL、SETTINGS_SECRET_KEY、PUBLIC_WEB_BASE_URL、SMTP_HOST、SMTP_PORT、SMTP_FROM_EMAIL、SMTP_USERNAME、SMTP_PASSWORD
INFO:     [配置自检] 取自 .env 文件或代码默认值的关键项：（无）
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8004 (Press CTRL+C to quit)
```

### 5) 契约测试与门禁

```text
# 改动 compose 前（TDD Red）
$ .venv/bin/python -m pytest tests/test_compose_contract.py -q
3 failed, 1 passed

# 改动 compose 后（Green）
$ .venv/bin/python -m pytest tests/test_compose_contract.py -q
4 passed

$ .venv/bin/python -m pytest -q
551 passed, 4 warnings in 19.63s

$ node quality-gates/run.js
Quality gates passed.
$ archkit inspect .
Quality gates passed.
```

### 6) 收尾

临时 uvicorn 进程已全部终止，`ps` 复核 8003/8004 无残留，两个端口均 free；用户正在使用的 8000 未受影响。本机 Docker daemon 未运行，无容器需要 `docker compose down`。

## Related ADRs

- None.
