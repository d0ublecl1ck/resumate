# backend

FastAPI service scaffolded by `archkit add project backend -s fastapi`.

## Layout

- `app/main.py`: application composition root; routers are registered with `app.include_router()`.
- `app/core/`: shared configuration (`config.py`, pydantic-settings), database engine/session, `get_db` and synchronous `check_database_connection` dependencies (`db.py`), and shared dependencies (`deps.py`).
- `app/shared/`: domain schemas, constants, and utilities reused by 2+ modules; modules may import shared, shared must never import modules.
- `app/modules/<module>/`: api.py / schemas.py / service.py / dao.py / models.py per domain module.
- `app/jobs/`: long-running or scheduled business jobs.
- `app/tasks/`: small task entrypoints.
- `migrations/versions/`: placeholder; Alembic is not configured yet.
- `tests/`: pytest tests using FastAPI TestClient.

## Develop

```bash
uv sync
uv run uvicorn app.main:app --reload
```

Health check: http://localhost:8000/health/ — OpenAPI docs: http://localhost:8000/docs

Run these commands from `backend/`. `DATABASE_URL` is read from the environment or `.env`; its default is `sqlite:///./app.db`, relative to the working directory.

`GET /health/` checks database connectivity through a synchronous infrastructure dependency before returning `200 {"status":"ok"}`. The route only constructs `HealthResponse`. Database failure returns `500 Internal Server Error` with the default non-debug configuration. Authentication is not configured.

## Test

```bash
uv run pytest
```

Tests use isolated SQLite connections and cover success, database failure, response construction, and the OpenAPI schema. The architecture is documented in [docs/design.md](../docs/design.md).
