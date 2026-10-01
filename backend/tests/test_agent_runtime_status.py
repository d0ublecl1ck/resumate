"""GET /agent/runtime readiness probe (issue e122a).

The endpoint only resolves the configured runner command on PATH; it never
executes it and never returns credentials.
"""

import sys

from fastapi.testclient import TestClient

from app.core.config import get_settings


def test_runtime_status_reports_a_resolvable_command(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "agent_runner_command", sys.executable)

    response = client.get("/agent/runtime")

    assert response.status_code == 200, response.text
    assert response.json() == {"command": sys.executable, "available": True}


def test_runtime_status_reports_a_missing_command(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "agent_runner_command", "resumate-agent-definitely-missing")

    response = client.get("/agent/runtime")

    assert response.status_code == 200, response.text
    assert response.json() == {"command": "resumate-agent-definitely-missing", "available": False}


def test_runtime_status_does_not_leak_credentials(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(get_settings(), "agent_runner_command", sys.executable)

    body = client.get("/agent/runtime").json()

    assert set(body) == {"command", "available"}
