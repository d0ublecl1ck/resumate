---
id: d731d
status: closed
created_at: 2026-10-06T06:54:06.322Z
updated_at: 2026-10-06T07:13:37.470Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-06T06:54:28.313Z
closed_at: 2026-10-06T07:13:37.470Z
---

# 统一启动入口：本地脚本与 Docker Compose 生产式启动

## Background

仓库此前只有 README「快速开始」里的四条手敲命令：启 PostgreSQL/Redis、`uv sync`、`alembic upgrade head`、seed、`uvicorn`、`pnpm dev`。任何一步顺序错或漏掉（例如没装 `resumate-agent`）都要到运行时才暴露，且没有容器化入口，换机器或部署时要重新摸索。

后端真正要跑通 Agent 轮次，还要求 `resumate-agent` CLI 在运行体的 `PATH` 上（`backend/app/core/config.py:60` 默认命令、`service.py:835` 用 `shutil.which` 探测、`runner.py:272` spawn），这是「看起来起来了但一跑就挂」的典型坑，两个入口都必须覆盖。

## Scope

- `scripts/dev.sh`：本机一体化启动脚本（up / down / restart / status / logs），幂等、可重复执行。
- `compose.yaml` + `docker/Dockerfile.backend` + `docker/Dockerfile.ui` + `docker/nginx.conf` + `.dockerignore`：生产式容器启动（nginx 托管 `ui/dist`，`/api` 反代 backend，入口自动迁移与 seed）。
- `README.md` 快速开始补两个入口。

## Non-goals

- 不改任何业务代码、接口契约、数据库 schema 与前端行为。
- 不做 CI/CD 流水线、不做镜像发布、不做 Kubernetes/多机编排。
- 不做开发式容器（vite dev + 源码挂卷）：本期只交付生产式镜像。

## Acceptance Criteria

- [x] `bash scripts/dev.sh up` 可重复执行；`bash scripts/dev.sh down` 后 8000/5173 均无监听进程。
- [x] `bash scripts/dev.sh status` 输出基础设施、端口、健康检查与 Agent CLI 四项状态。
- [x] `docker compose up -d --build` 后，宿主机 `curl http://localhost:8081/` 返回 200，`curl http://localhost:8081/api/health/` 返回 `{"status":"ok"}`。
- [x] backend 容器内 `resumate-agent` 可解析（`docker compose exec backend which resumate-agent` 非空），且 `/api/agent/runtime` 返回 `available: true`。
- [x] 容器入口自动执行 `alembic upgrade head` 与 seed，且重复 `up` 幂等不报错。
- [x] `docker compose down` 后宿主机 8081 端口释放，PostgreSQL 数据卷保留。
- [x] `archkit inspect .` 通过。

## Implementation

**`scripts/dev.sh`**（本机入口，无容器依赖）

- 子命令：`up`（默认）/ `down` / `restart` / `status` / `logs [backend|frontend]` / `help`。
- `up` 顺序：PostgreSQL（未就绪则 `brew services start postgresql@18`，缺库则 `createdb`）→ Redis → Agent CLI（缺 `resumate-agent` 时 `uv tool install agent-core`）→ `uv sync` → `alembic upgrade head` → seed → uvicorn → 等 `/health/` → `pnpm install`（仅当 `ui/node_modules` 缺失或锁文件更新）→ vite → 等 `:5173`。
- 幂等：端口已被占用时只提示并跳过，不重复拉起；PID 与日志落 `backend/var/dev/`（已 gitignore）。
- `down`：先按 PID 文件做只读检查并打印 `ps` 信息，再递归终止进程树（`kill_tree`）；之后复查端口，仍被占用才升级为强制结束，最后再复查一次，未释放即非零退出。
- 依赖安装输出重定向到 `backend/var/dev/*-deps.log` / `backend-migrate.log`，失败时回显日志尾部。

**容器入口**

- `docker/Dockerfile.backend`：`python:3.13-slim` + `uv==0.9.5`；`uv sync --frozen --no-dev`（先拷 `pyproject.toml`/`uv.lock` 再拷源码，保缓存）；`uv tool install /tmp/agent-core` 把 `resumate-agent` 装进 `/root/.local/bin` 并加入 `PATH`。
- `docker/backend-entrypoint.sh`：`alembic upgrade head` → `python -m app.tasks.seed` → `exec uvicorn app.main:app --host 0.0.0.0 --port 8000`。
- `docker/Dockerfile.ui`：`node:24-alpine` 构建（`ENV CI=true`——pnpm 在非 TTY 环境会以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 失败；`ARG NPM_REGISTRY` 默认指向 npmmirror，可用 `--build-arg` 覆盖）→ `nginx:alpine` 托管 `ui/dist`。
- `docker/nginx.conf`：SPA `try_files ... /index.html`；`/api/` 反代 `http://backend:8000/`，保留 `Host: backend:8000`（Agent runner 用 `request.base_url` 作 CLI 回调地址，见 `backend/app/modules/agent/runner.py:280`），并关闭 `proxy_buffering` 以支持 SSE。
- `compose.yaml`：`postgres:18-alpine`（卷挂 `/var/lib/postgresql`，18 起 PGDATA 在其下）、`redis:7-alpine`、`backend`（健康检查走 `/health/`，`start_period` 覆盖迁移耗时）、`ui`（宿主 `8081:80`）。所有服务带 healthcheck 与 `depends_on: service_healthy`。
- 两个 Dockerfile 都**不写** `# syntax=docker/dockerfile:1`：该指令会让构建去 Docker Hub 解析 frontend 镜像，在无法直连 registry 的网络下直接失败。

**文档**：`README.md` 快速开始拆成「本机一条命令 / 容器一条命令 / 手动分步」三节。

## Verification

```
$ bash scripts/dev.sh up          # 首次与重复执行均 exit=0
[ok] PostgreSQL 已就绪 / 数据库 resumate、resumate_test 存在 / Redis 已就绪
[ok] Agent CLI 已安装：resumate-agent（uv tool 安装，位于 PATH）
[ok] 后端 就绪：http://127.0.0.1:8000/health/
[ok] 前端 就绪：http://localhost:5173/
$ bash scripts/dev.sh up          # 已在运行
[!!] 端口 8000 已被占用，跳过启动后端；占用进程：… uvicorn app.main:app --reload
[!!] 端口 5173 已被占用，跳过启动前端；占用进程：… vite
$ bash scripts/dev.sh down
[ok] backend 已停止（端口 8000 已释放）
[ok] frontend 已停止（端口 5173 已释放）
$ lsof -nP -iTCP:8000 -sTCP:LISTEN; lsof -nP -iTCP:5173 -sTCP:LISTEN   # 均为空

$ docker compose up -d --build
 Container resumate-postgres-1 Healthy
 Container resumate-redis-1 Healthy
 Container resumate-backend-1 Healthy
 Container resumate-ui-1 Started
$ curl -sS -o /dev/null -w '%{http_code}' http://localhost:8081/            # 200
$ curl -sS -o /dev/null -w '%{http_code}' http://localhost:8081/resumes/abc # 200（SPA 深链接）
$ curl -sS http://localhost:8081/api/health/                                # {"status":"ok"}
$ docker compose exec -T backend which resumate-agent                       # /root/.local/bin/resumate-agent
$ docker compose exec -T backend resumate-agent --help | head -1            # usage: resumate-agent …
$ curl -sS -c /tmp/c.txt -X POST http://localhost:8081/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@resumate.dev","password":"resumate-admin"}'         # 200
$ curl -sS -b /tmp/c.txt http://localhost:8081/api/agent/runtime
{"command":"resumate-agent","available":true}

$ docker compose logs backend | grep -E 'entrypoint|Uvicorn running'
[entrypoint] alembic upgrade head
[entrypoint] seed（幂等）
seeded 0 template(s), 0 rbac row(s); bootstrap admin created=False
[entrypoint] uvicorn 0.0.0.0:8000
INFO:     Uvicorn running on http://0.0.0.0:8000

$ docker compose down                       # 容器与网络移除
$ lsof -nP -iTCP:8081 -sTCP:LISTEN          # 空
$ docker volume ls | grep resumate          # resumate_pgdata（数据卷保留）
$ docker compose up -d                      # 再次拉起，全部 Healthy，健康检查仍 200
```

补充说明：本机 `8080` 已被另一个本地服务占用，因此 compose 的宿主端口定为 `8081`；如需改动只改 `compose.yaml` 的 `ports` 与 `PUBLIC_WEB_BASE_URL`。

## Related ADRs

- None.
