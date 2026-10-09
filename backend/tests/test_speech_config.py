"""语音识别配置：加密落库、脱敏返回、可区分错误码，与既有模型配置同一套路。"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.settings import service
from app.modules.settings.models import UserSettings


def test_speech_config_defaults_and_never_echoes_key(client) -> None:
    response = client.get("/speech/config")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["provider"] == "dashscope"
    assert body["region"] == "cn-beijing"
    assert body["model"] == "paraformer-v2"
    assert body["endpoint"] == ""
    assert body["keyConfigured"] is False
    assert "apiKey" not in body


def test_speech_key_is_encrypted_at_rest_and_never_returned(client, db_session: Session) -> None:
    saved = client.put(
        "/speech/config",
        json={"provider": "dashscope", "region": "cn-beijing", "model": "paraformer-v2", "apiKey": "sk-speech-secret"},
    )

    assert saved.status_code == 200, saved.text
    body = saved.json()
    assert body["keyConfigured"] is True
    assert "apiKey" not in body

    stored = db_session.scalar(select(UserSettings).where(UserSettings.owner_id == "user_test"))
    assert stored is not None
    ciphertext = stored.speech_config["apiKey"]
    assert ciphertext.startswith(service.ENCRYPTED_PREFIX)
    assert "sk-speech-secret" not in ciphertext
    assert service.decrypt_api_key(ciphertext) == "sk-speech-secret"


def test_clearing_speech_key_marks_unconfigured(client) -> None:
    client.put("/speech/config", json={"apiKey": "sk-1"})
    response = client.put("/speech/config", json={"apiKey": ""})

    assert response.status_code == 200
    assert response.json()["keyConfigured"] is False


def test_unknown_region_is_rejected_by_contract(client) -> None:
    response = client.put("/speech/config", json={"region": "us-east-1"})
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_speech_test_without_key_returns_validation_failed(client) -> None:
    response = client.post("/speech/config:test")

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_speech_test_maps_rejection_to_safe_message(client, monkeypatch) -> None:
    client.put("/speech/config", json={"apiKey": "sk-bad"})
    monkeypatch.setattr(
        service.dashscope_asr,
        "probe_credentials",
        lambda **kwargs: (False, "语音识别服务拒绝凭证，请检查 API Key 与地域配置"),
    )

    response = client.post("/speech/config:test")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ok"] is False
    assert body["message"] == "语音识别服务拒绝凭证，请检查 API Key 与地域配置"
    # 结果持久化后读取接口仍不回显任何凭证。
    assert client.get("/speech/config").json()["keyConfigured"] is True
    assert "apiKey" not in client.get("/speech/config").json()


def test_speech_test_success_is_recorded(client, monkeypatch) -> None:
    client.put("/speech/config", json={"apiKey": "sk-ok"})
    monkeypatch.setattr(service.dashscope_asr, "probe_credentials", lambda **kwargs: (True, "凭据可用"))

    body = client.post("/speech/config:test").json()

    assert body["ok"] is True
    assert body["message"] == "凭据可用"
    read_back = client.get("/speech/config").json()
    assert read_back["lastTest"]["ok"] is True
    assert read_back["lastTest"]["message"] == "凭据可用"
