#!/bin/sh
# 容器入口：迁移 -> seed -> 前台启动 API。两步都是幂等的，重复 up 不会报错。
set -eu

cd /app/backend

echo "[entrypoint] alembic upgrade head"
uv run --frozen alembic upgrade head

echo "[entrypoint] seed（幂等）"
uv run --frozen python -m app.tasks.seed

echo "[entrypoint] uvicorn 0.0.0.0:8000"
exec uv run --frozen uvicorn app.main:app --host 0.0.0.0 --port 8000
