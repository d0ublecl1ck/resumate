from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.settings import service
from app.modules.settings.models import UserSettings


def test_get_settings_is_idempotent(client: TestClient) -> None:
    first = client.get("/settings")
    second = client.get("/settings")

    assert first.status_code == 200
    body = first.json()
    assert body["theme"] == "paper"
    assert body["language"] == "zh-CN"
    assert body["autosave"] is True
    assert body["defaultTemplateId"] == ""
    assert body["defaultTemplateRetired"] is False
    assert body["displayName"] == "本地用户"
    assert body["shortcuts"]
    assert second.json() == body


def test_patch_settings_persists_partial_update(client: TestClient) -> None:
    response = client.patch(
        "/settings",
        json={"theme": "dark", "language": "en-US", "autosave": False, "displayName": "张沐"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["theme"] == "dark"
    assert body["language"] == "en-US"
    assert body["autosave"] is False
    assert body["displayName"] == "张沐"
    assert client.get("/settings").json()["theme"] == "dark"


def test_invalid_theme_is_rejected_by_contract(client: TestClient) -> None:
    response = client.patch("/settings", json={"theme": "neon"})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_default_template_availability_is_reported(client: TestClient) -> None:
    published = client.patch("/settings", json={"defaultTemplateId": "tpl_classic"}).json()
    missing = client.patch("/settings", json={"defaultTemplateId": "tpl_missing"}).json()

    assert published["defaultTemplateRetired"] is False
    assert missing["defaultTemplateRetired"] is True


def test_agent_config_read_and_update(client: TestClient) -> None:
    initial = client.get("/agent/config").json()
    assert initial["nextRunMode"] == "approval"
    assert initial["modeSource"] == "account"
    assert initial["currentRunMode"] is None
    assert initial["budget"] == {"maxTokens": 20000, "maxTurns": 8, "maxCostUsd": 0.5}
    assert initial["fullAccessScopes"] and initial["confirmRetainedOps"]

    response = client.patch(
        "/agent/config",
        json={"nextRunMode": "full_access", "budget": {"maxTokens": 1000, "maxTurns": 3, "maxCostUsd": 0.1}},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["nextRunMode"] == "full_access"
    assert body["budget"] == {"maxTokens": 1000, "maxTurns": 3, "maxCostUsd": 0.1}
    assert client.get("/agent/config").json()["nextRunMode"] == "full_access"


def test_model_config_never_returns_api_key(client: TestClient) -> None:
    response = client.put(
        "/models/config",
        json={
            "provider": "OpenAI 兼容",
            "endpoint": "https://api.example.com/v1",
            "model": "gpt-4o-mini",
            "apiKey": "sk-secret-value",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "OpenAI 兼容"
    assert body["keyConfigured"] is True
    assert "apiKey" not in body
    assert "sk-secret-value" not in response.text


def test_clearing_api_key_marks_key_unconfigured(client: TestClient) -> None:
    client.put("/models/config", json={"apiKey": "sk-1"})
    response = client.put("/models/config", json={"apiKey": ""})

    assert response.status_code == 200
    assert response.json()["keyConfigured"] is False


def test_model_test_failure_does_not_leak_key(client: TestClient, monkeypatch) -> None:
    client.put("/models/config", json={"endpoint": "https://api.example.com/v1", "apiKey": "sk-super-secret"})

    def fail(endpoint: str, api_key: str | None) -> tuple[bool, str]:
        assert api_key == "sk-super-secret"
        return False, "模型服务返回 HTTP 401，请检查 Endpoint、模型名与凭证"

    monkeypatch.setattr(service, "_probe", fail)

    response = client.post("/models/config:test")

    assert response.status_code == 200
    assert response.json()["ok"] is False
    assert "sk-super-secret" not in response.text
    assert client.get("/models/config").json()["lastTest"]["ok"] is False


def test_model_test_success_records_timestamp(client: TestClient, monkeypatch) -> None:
    client.put("/models/config", json={"endpoint": "https://api.example.com/v1"})
    monkeypatch.setattr(service, "_probe", lambda endpoint, api_key: (True, "连接成功（HTTP 200）"))

    body = client.post("/models/config:test").json()

    assert body["ok"] is True
    assert body["at"]
    assert "连接成功" in body["message"]
    assert client.get("/models/config").json()["lastTest"]["message"] == body["message"]


def test_model_test_without_endpoint_is_rejected(client: TestClient) -> None:
    response = client.post("/models/config:test")

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_api_key_is_encrypted_at_rest(client: TestClient, db_session: Session) -> None:
    client.put("/models/config", json={"apiKey": "sk-plain-secret"})

    row = db_session.scalar(select(UserSettings))

    assert row is not None
    stored = row.model_config["apiKey"]
    assert stored.startswith(service.ENCRYPTED_PREFIX)
    assert "sk-plain-secret" not in stored


def test_undecryptable_key_is_treated_as_unconfigured(
    client: TestClient, db_session: Session, monkeypatch
) -> None:
    client.put("/models/config", json={"endpoint": "https://api.example.com/v1", "apiKey": "sk-1"})
    row = db_session.scalar(select(UserSettings))
    assert row is not None
    config = dict(row.model_config)
    config["apiKey"] = service.ENCRYPTED_PREFIX + "not-a-real-token"
    row.model_config = config
    db_session.commit()
    captured: dict[str, str | None] = {}

    def probe(endpoint: str, api_key: str | None) -> tuple[bool, str]:
        captured["key"] = api_key
        return True, "连接成功（HTTP 200）"

    monkeypatch.setattr(service, "_probe", probe)

    response = client.post("/models/config:test")

    assert response.status_code == 200
    assert captured["key"] is None


def test_conflicting_shortcuts_are_rejected_and_keep_original(client: TestClient) -> None:
    current = client.get("/settings").json()["shortcuts"]
    conflicting = [current[0], {**current[1], "keys": current[0]["keys"]}]

    response = client.patch("/settings", json={"shortcuts": conflicting})

    assert response.status_code == 422
    assert "已绑定" in response.json()["message"]
    assert client.get("/settings").json()["shortcuts"][1]["keys"] == current[1]["keys"]


def test_shortcuts_can_be_saved_when_unique(client: TestClient) -> None:
    current = client.get("/settings").json()["shortcuts"]
    updated = [{**item, "keys": item["keys"] + "!"} for item in current]

    response = client.patch("/settings", json={"shortcuts": updated})

    assert response.status_code == 200
    assert response.json()["shortcuts"][0]["keys"].endswith("!")
    assert response.json()["shortcuts"][0]["conflict"] is not True
