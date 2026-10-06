#!/usr/bin/env bash
# Resumate 本地一体化启动脚本：基础设施 -> 后端 -> 前端 -> Agent CLI。
#
# 用法：
#   scripts/dev.sh up            启动整套（默认命令，可重复执行）
#   scripts/dev.sh down          停止由本脚本启动的进程
#   scripts/dev.sh restart       先 down 再 up
#   scripts/dev.sh status        只读检查：基础设施、端口、健康检查、Agent CLI
#   scripts/dev.sh logs [backend|frontend]
#   scripts/dev.sh help
#
# 运行期产物（日志与 PID 文件）统一放在 backend/var/dev/，该目录已在 .gitignore 中。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT/backend/var/dev"
LOG_DIR="$RUNTIME_DIR"
BACKEND_HOST="127.0.0.1"
BACKEND_PORT="8000"
FRONTEND_PORT="5173"
FRONTEND_URL="http://localhost:$FRONTEND_PORT/"
BACKEND_HEALTH_URL="http://$BACKEND_HOST:$BACKEND_PORT/health/"
POSTGRES_SERVICE="postgresql@18"
REQUIRED_DBS=("resumate" "resumate_test")

info() { printf '[..] %s\n' "$*"; }
ok()   { printf '[ok] %s\n' "$*"; }
warn() { printf '[!!] %s\n' "$*" >&2; }
fail() { printf '[xx] %s\n' "$*" >&2; exit 1; }

port_pids() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | sort -u || true
}

describe_pid() {
  ps -o pid=,ppid=,etime=,command= -p "$1" 2>/dev/null | sed 's/^ *//' || true
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令 $1；$2"
}

ensure_runtime_dir() { mkdir -p "$RUNTIME_DIR"; }

# --- 基础设施 ---------------------------------------------------------------

ensure_postgres() {
  if ! pg_isready -q 2>/dev/null; then
    info "PostgreSQL 未就绪，尝试 brew services start $POSTGRES_SERVICE"
    brew services start "$POSTGRES_SERVICE" >/dev/null 2>&1 || true
    local waited=0
    until pg_isready -q 2>/dev/null; do
      (( waited >= 30 )) && fail "PostgreSQL 30s 内未就绪"
      sleep 1; waited=$((waited + 1))
    done
  fi
  ok "PostgreSQL 已就绪"

  local db existing
  existing="$(psql -lqt 2>/dev/null | cut -d'|' -f1 | tr -d ' ' || true)"
  for db in "${REQUIRED_DBS[@]}"; do
    if grep -qx "$db" <<<"$existing"; then
      ok "数据库 $db 存在"
    else
      info "创建数据库 $db"
      createdb "$db" || fail "创建数据库 $db 失败"
      ok "数据库 $db 已创建"
    fi
  done
}

ensure_redis() {
  if [[ "$(redis-cli ping 2>/dev/null || true)" != "PONG" ]]; then
    info "Redis 未就绪，尝试 brew services start redis"
    brew services start redis >/dev/null 2>&1 || true
    local waited=0
    until [[ "$(redis-cli ping 2>/dev/null || true)" == "PONG" ]]; do
      (( waited >= 30 )) && fail "Redis 30s 内未就绪"
      sleep 1; waited=$((waited + 1))
    done
  fi
  ok "Redis 已就绪"
}

# --- Agent CLI --------------------------------------------------------------

ensure_agent_cli() {
  if command -v resumate-agent >/dev/null 2>&1; then
    ok "Agent CLI 已安装：$(command -v resumate-agent)"
  else
    info "安装 Agent CLI：uv tool install agent-core"
    uv tool install "$ROOT/agent-core" >/dev/null || fail "agent-core 安装失败"
    ok "Agent CLI 已安装：$(command -v resumate-agent)"
  fi
}

# --- 后端 -------------------------------------------------------------------

backend_deps() {
  info "同步后端依赖：uv sync"
  if ! ( cd "$ROOT/backend" && uv sync ) >"$LOG_DIR/backend-deps.log" 2>&1; then
    tail -n 20 "$LOG_DIR/backend-deps.log" >&2
    fail "uv sync 失败"
  fi
  ok "后端依赖已同步"
}

backend_migrate_and_seed() {
  info "执行数据库迁移：alembic upgrade head"
  if ! ( cd "$ROOT/backend" && uv run alembic upgrade head ) >"$LOG_DIR/backend-migrate.log" 2>&1; then
    tail -n 20 "$LOG_DIR/backend-migrate.log" >&2
    fail "alembic upgrade head 失败"
  fi
  ok "数据库迁移已应用"

  info "写入种子数据（幂等）"
  ( cd "$ROOT/backend" && uv run python -m app.tasks.seed )
}

start_backend() {
  local pids
  pids="$(port_pids "$BACKEND_PORT")"
  if [[ -n "$pids" ]]; then
    warn "端口 $BACKEND_PORT 已被占用，跳过启动后端；占用进程："
    while read -r pid; do [[ -n "$pid" ]] && describe_pid "$pid"; done <<<"$pids"
    return 0
  fi

  ensure_runtime_dir
  (
    cd "$ROOT/backend"
    nohup uv run uvicorn app.main:app --reload >>"$LOG_DIR/backend.log" 2>&1 &
    echo $! >"$RUNTIME_DIR/backend.pid"
  )
  info "后端已拉起（PID $(cat "$RUNTIME_DIR/backend.pid")），日志 $LOG_DIR/backend.log"
}

wait_http() {
  local url="$1" timeout="$2" label="$3" log="$4" waited=0
  while (( waited < timeout )); do
    if curl -fsS -m 2 "$url" >/dev/null 2>&1; then
      ok "$label 就绪：$url"
      return 0
    fi
    sleep 1; waited=$((waited + 1))
    if (( waited % 10 == 0 )); then info "$label 等待中… ${waited}s"; fi
  done
  warn "$label 在 ${timeout}s 内未就绪，日志尾部（${log}）："
  tail -n 20 "$log" >&2 || true
  return 1
}

# --- 前端 -------------------------------------------------------------------

needs_pnpm_install() {
  local marker="$ROOT/node_modules/.modules.yaml"
  [[ -d "$ROOT/ui/node_modules" && -f "$marker" ]] || return 0
  [[ "$ROOT/pnpm-lock.yaml" -nt "$marker" ]]
}

frontend_deps() {
  if needs_pnpm_install; then
    info "安装前端依赖：pnpm install"
    if ! ( cd "$ROOT" && CI=true pnpm install ) >"$LOG_DIR/frontend-deps.log" 2>&1; then
      tail -n 20 "$LOG_DIR/frontend-deps.log" >&2
      fail "pnpm install 失败"
    fi
    ok "前端依赖已安装"
  else
    ok "前端依赖已是最新"
  fi
}

start_frontend() {
  local pids
  pids="$(port_pids "$FRONTEND_PORT")"
  if [[ -n "$pids" ]]; then
    warn "端口 $FRONTEND_PORT 已被占用，跳过启动前端；占用进程："
    while read -r pid; do [[ -n "$pid" ]] && describe_pid "$pid"; done <<<"$pids"
    return 0
  fi

  ensure_runtime_dir
  (
    cd "$ROOT/ui"
    nohup pnpm dev >>"$LOG_DIR/frontend.log" 2>&1 &
    echo $! >"$RUNTIME_DIR/frontend.pid"
  )
  info "前端已拉起（PID $(cat "$RUNTIME_DIR/frontend.pid")），日志 $LOG_DIR/frontend.log"
}

# --- 停止 -------------------------------------------------------------------

kill_tree() {
  local pid="$1" sig="$2" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child" "$sig"
  done
  kill -"$sig" "$pid" 2>/dev/null || true
}

stop_from_pidfile() {
  local name="$1" port="$2" pidfile="$RUNTIME_DIR/$1.pid" pid
  [[ -f "$pidfile" ]] || { info "$name 无 PID 文件，跳过"; return 0; }
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  rm -f "$pidfile"
  [[ -n "$pid" ]] || { warn "$name PID 文件为空"; return 0; }

  if kill -0 "$pid" 2>/dev/null; then
    info "停止 ${name}（PID ${pid}）：$(describe_pid "$pid")"
    kill_tree "$pid" TERM
  else
    warn "$name PID $pid 已不存在"
  fi

  local waited=0
  while (( waited < 10 )); do
    [[ -z "$(port_pids "$port")" ]] && break
    sleep 1; waited=$((waited + 1))
  done
}

down() {
  stop_from_pidfile backend "$BACKEND_PORT"
  stop_from_pidfile frontend "$FRONTEND_PORT"

  local port pids pid name
  for pair in "backend:$BACKEND_PORT" "frontend:$FRONTEND_PORT"; do
    name="${pair%%:*}"; port="${pair##*:}"
    pids="$(port_pids "$port")"
    if [[ -n "$pids" ]]; then
      warn "$name 端口 $port 仍被占用，强制结束："
      while read -r pid; do
        [[ -n "$pid" ]] || continue
        describe_pid "$pid"
        kill_tree "$pid" KILL
      done <<<"$pids"
    fi
  done

  sleep 1
  local left=""
  for pair in "backend:$BACKEND_PORT" "frontend:$FRONTEND_PORT"; do
    name="${pair%%:*}"; port="${pair##*:}"
    if [[ -n "$(port_pids "$port")" ]]; then
      left="$left $name($port)"
    else
      ok "$name 已停止（端口 $port 已释放）"
    fi
  done
  [[ -z "$left" ]] || fail "以下端口仍未释放：$left"
}

# --- 状态 -------------------------------------------------------------------

status() {
  printf 'Resumate 状态（%s）\n' "$ROOT"

  printf '\n[基础设施]\n'
  if pg_isready -q 2>/dev/null; then ok "PostgreSQL 可连接"; else warn "PostgreSQL 不可连接"; fi
  if [[ "$(redis-cli ping 2>/dev/null || true)" == "PONG" ]]; then ok "Redis 可连接"; else warn "Redis 不可连接"; fi

  printf '\n[进程]\n'
  local pair port pids pid name
  for pair in "backend:$BACKEND_PORT" "frontend:$FRONTEND_PORT"; do
    name="${pair%%:*}"; port="${pair##*:}"
    pids="$(port_pids "$port")"
    if [[ -z "$pids" ]]; then
      warn "$name 未监听 $port"
    else
      while read -r pid; do [[ -n "$pid" ]] && printf '[ok] %s %s\n' "$name" "$(describe_pid "$pid")"; done <<<"$pids"
    fi
  done

  printf '\n[健康检查]\n'
  local health
  health="$(curl -fsS -m 3 "$BACKEND_HEALTH_URL" 2>/dev/null || true)"
  if [[ -n "$health" ]]; then ok "后端 $BACKEND_HEALTH_URL -> $health"; else warn "后端健康检查失败：$BACKEND_HEALTH_URL"; fi
  if curl -fsS -m 3 -o /dev/null "$FRONTEND_URL" 2>/dev/null; then ok "前端 $FRONTEND_URL 返回 200"; else warn "前端不可访问：$FRONTEND_URL"; fi

  printf '\n[Agent CLI]\n'
  if command -v resumate-agent >/dev/null 2>&1; then ok "$(command -v resumate-agent)"; else warn "resumate-agent 不在 PATH，执行 scripts/dev.sh up 会安装"; fi

  printf '\n[运行期文件]\n'
  printf '日志目录：%s\n' "$LOG_DIR"
  ls -1 "$LOG_DIR" 2>/dev/null | sed 's/^/  /' || true
}

logs() {
  local target="${1:-backend}" file
  case "$target" in
    backend|frontend) file="$LOG_DIR/$target.log" ;;
    *) fail "用法：scripts/dev.sh logs [backend|frontend]" ;;
  esac
  [[ -f "$file" ]] || fail "日志不存在：$file"
  tail -n 40 -f "$file"
}

# --- 入口 -------------------------------------------------------------------

up() {
  ensure_runtime_dir
  require_cmd uv "安装：https://docs.astral.sh/uv/"
  require_cmd node "安装 Node.js"
  require_cmd pnpm "安装：npm i -g pnpm"
  require_cmd psql "安装：brew install $POSTGRES_SERVICE"
  require_cmd redis-cli "安装：brew install redis"
  require_cmd lsof "macOS 自带"

  ensure_postgres
  ensure_redis
  ensure_agent_cli
  backend_deps
  backend_migrate_and_seed
  start_backend
  wait_http "$BACKEND_HEALTH_URL" 60 "后端" "$LOG_DIR/backend.log"
  frontend_deps
  start_frontend
  wait_http "$FRONTEND_URL" 60 "前端" "$LOG_DIR/frontend.log"

  printf '\n'
  ok "整套已启动"
  printf '  前端      %s\n' "$FRONTEND_URL"
  printf '  后端      http://%s:%s/（文档 /docs）\n' "$BACKEND_HOST" "$BACKEND_PORT"
  printf '  登录账号  admin@resumate.dev / resumate-admin（仅本地）\n'
  printf '  日志      %s/{backend,frontend}.log\n' "$LOG_DIR"
  printf '  停止      scripts/dev.sh down\n'
}

usage() {
  sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

main() {
  case "${1:-up}" in
    up) up ;;
    down) down ;;
    restart) down; up ;;
    status) status ;;
    logs) shift || true; logs "${1:-backend}" ;;
    help|-h|--help) usage ;;
    *) usage; exit 1 ;;
  esac
}

main "$@"
