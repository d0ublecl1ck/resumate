import asyncio
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.db import get_db
from app.main import app
from app.modules.health.api import get_health


@pytest.fixture
def client() -> Iterator[TestClient]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    def test_db() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = test_db
    try:
        with TestClient(app, raise_server_exceptions=False) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


def test_health_response_does_not_require_database_session() -> None:
    response = asyncio.run(get_health())

    assert response.model_dump() == {"status": "ok"}


def test_health_returns_ok_status(client: TestClient) -> None:
    response = client.get("/health/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_route_is_documented_in_openapi(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert "/health/" in paths
    assert paths["/health/"]["get"]["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/HealthResponse"
    }


def test_health_fails_when_database_is_unavailable(client: TestClient, tmp_path: Path) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'missing' / 'app.db'}")

    def unavailable_db() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = unavailable_db
    try:
        response = client.get("/health/")
        assert response.status_code == 500, "Database failure must not report healthy"
        assert response.text == "Internal Server Error", "Database details must not leak"
    finally:
        engine.dispose()
