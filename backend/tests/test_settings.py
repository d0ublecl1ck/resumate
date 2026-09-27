from fastapi.testclient import TestClient

from app.modules.settings import service


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
