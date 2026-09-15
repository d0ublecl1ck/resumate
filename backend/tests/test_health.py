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
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    def database() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = database
    try:
        with TestClient(app, raise_server_exceptions=False) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


def test_response_is_independent_of_database():
    assert asyncio.run(get_health()).model_dump() == {"status": "ok"}


def test_health_and_schema(client: TestClient):
    response = client.get("/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    document = client.get("/openapi.json").json()
    schema = document["paths"]["/health/"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema == {"$ref": "#/components/schemas/HealthResponse"}


def test_database_failure_is_not_healthy(client: TestClient, tmp_path: Path):
    engine = create_engine(f"sqlite:///{tmp_path / 'missing' / 'app.db'}")

    def database() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = database
    try:
        response = client.get("/health/")
        assert response.status_code == 500
        assert response.text == "Internal Server Error"
    finally:
        engine.dispose()
