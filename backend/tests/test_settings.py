from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.settings import catalog, service
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
    assert body["displayName"] == "测试用户"
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
    client.put("/models/config", json={"model": "gpt-4o-mini", "apiKey": "sk-super-secret"})

    def fail(**kwargs) -> tuple[bool, str]:
        assert kwargs["api_key"] == "sk-super-secret"
        return False, "模型服务拒绝凭证，请检查 API Key 与 provider 配置"

    monkeypatch.setattr(catalog, "probe_connection", fail)

    response = client.post("/models/config:test")

    assert response.status_code == 200
    assert response.json()["ok"] is False
    assert "sk-super-secret" not in response.text
    assert client.get("/models/config").json()["lastTest"]["ok"] is False


def test_model_test_success_records_timestamp(client: TestClient, monkeypatch) -> None:
    client.put("/models/config", json={"provider": "openai", "model": "gpt-4o-mini"})
    monkeypatch.setattr(catalog, "probe_connection", lambda **kwargs: (True, "连接成功"))

    body = client.post("/models/config:test").json()

    assert body["ok"] is True
    assert body["at"]
    assert "连接成功" in body["message"]
    assert client.get("/models/config").json()["lastTest"]["message"] == body["message"]


def test_model_test_without_model_is_rejected(client: TestClient) -> None:
    response = client.post("/models/config:test")

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_model_config_fields_are_all_optional(client: TestClient) -> None:
    assert client.put("/models/config", json={}).status_code == 200

    provider_only = client.put("/models/config", json={"provider": "openai"}).json()
    assert provider_only["provider"] == "openai"
    assert provider_only["model"] == ""
    assert provider_only["endpoint"] == ""
    assert provider_only["keyConfigured"] is False

    model_only = client.put("/models/config", json={"model": "gpt-4o-mini"}).json()
    assert model_only["provider"] == "openai"  # untouched by the partial update
    assert model_only["model"] == "gpt-4o-mini"

    endpoint_only = client.put(
        "/models/config", json={"endpoint": "https://api.example.com/v1"}
    ).json()
    assert endpoint_only["endpoint"] == "https://api.example.com/v1"


def test_model_catalog_comes_from_models_dev_snapshot(client: TestClient) -> None:
    response = client.get("/models/catalog")

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "models.dev"
    assert body["providers"]

    openai = next((provider for provider in body["providers"] if provider["id"] == "openai"), None)
    assert openai is not None
    assert openai["label"] == "OpenAI"
    assert openai["models"]
    sample = openai["models"][0]
    assert set(sample) <= {
        "id",
        "label",
        "contextWindow",
        "maxOutputTokens",
        "inputCostPerMillion",
        "outputCostPerMillion",
    }
    assert any(model.get("contextWindow") is not None for model in openai["models"])
    assert any(model.get("inputCostPerMillion") is not None for model in openai["models"])


def test_model_catalog_filters_by_query(client: TestClient) -> None:
    full = client.get("/models/catalog").json()
    needle = full["providers"][0]["models"][0]["id"][:4]

    filtered = client.get("/models/catalog", params={"q": needle}).json()

    assert filtered["providers"]
    for provider in filtered["providers"]:
        for model in provider["models"]:
            haystack = f"{model['id']} {model['label']}".lower()
            assert needle.lower() in haystack


def test_model_catalog_provider_filter_returns_only_that_provider(client: TestClient) -> None:
    full = client.get("/models/catalog").json()
    target = full["providers"][0]["id"]

    body = client.get("/models/catalog", params={"provider": target}).json()

    assert [provider["id"] for provider in body["providers"]] == [target]
    assert body["providers"][0]["models"]


def test_model_catalog_reads_the_local_snapshot_offline(client: TestClient) -> None:
    # The catalog must never reach the network at request time; the committed
    # snapshot resolves the full catalog.
    body = client.get("/models/catalog").json()
    assert sum(len(provider["models"]) for provider in body["providers"]) > 100


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
    client.put("/models/config", json={"model": "gpt-4o-mini", "apiKey": "sk-1"})
    row = db_session.scalar(select(UserSettings))
    assert row is not None
    config = dict(row.model_config)
    config["apiKey"] = service.ENCRYPTED_PREFIX + "not-a-real-token"
    row.model_config = config
    db_session.commit()
    captured: dict[str, str | None] = {}

    def probe(**kwargs) -> tuple[bool, str]:
        captured["key"] = kwargs["api_key"]
        return True, "连接成功"

    monkeypatch.setattr(catalog, "probe_connection", probe)

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
