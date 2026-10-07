"""POST /jds:parse-text: structure pasted JD text with the configured model (fb67d)."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.modules.jd import parser

MODEL_CONFIG = {
    "provider": "deepseek",
    "endpoint": "https://api.deepseek.com/v1",
    "model": "deepseek-flash",
    "apiKey": "sk-test-secret-key",
}

VALID_JSON = (
    '{"role":"高级前端工程师","company":"美团","tags":["前端","性能优化"],'
    '"sourceUrl":"https://example.com/jobs/1","parseConfidence":0.88,'
    '"extracted":[{"label":"岗位","value":"高级前端工程师"}]}'
)

INPUT_TEXT = "我们在找一个人，负责把交易链路做快做稳，和设计、后端一起把体验打磨好。"


def _configure(client: TestClient, **overrides) -> None:
    response = client.put("/models/config", json={**MODEL_CONFIG, **overrides})
    assert response.status_code == 200, response.text


def _mock_chat(monkeypatch: pytest.MonkeyPatch, *, content: str) -> list[dict]:
    calls: list[dict] = []

    def fake(**kwargs):
        calls.append(kwargs)
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    monkeypatch.setattr(parser, "_chat_completion", fake)
    return calls


def _parse(client: TestClient, text: str = INPUT_TEXT):
    return client.post("/jds:parse-text", json={"text": text})


def test_parse_text_returns_model_draft(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client)
    calls = _mock_chat(monkeypatch, content=VALID_JSON)

    response = _parse(client)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "高级前端工程师"
    assert body["company"] == "美团"
    assert body["tags"] == ["前端", "性能优化"]
    assert body["body"] == INPUT_TEXT
    assert body["inputSource"] == "text"
    assert body["note"] == parser.PARSE_NOTE
    assert body["sourceUrl"] == "https://example.com/jobs/1"
    assert body["extracted"] == [{"label": "岗位", "value": "高级前端工程师"}]
    assert body["parseConfidence"] == pytest.approx(0.88)
    # 证明用的是用户配置的模型与密钥，而不是本地启发式。
    assert calls and calls[0]["payload"]["model"] == "deepseek-flash"
    assert calls[0]["headers"]["Authorization"] == "Bearer sk-test-secret-key"


def test_parse_text_without_model_is_409(client: TestClient) -> None:
    response = _parse(client)

    assert response.status_code == 409
    assert response.json()["code"] == "MODEL_NOT_CONFIGURED"


def test_parse_text_timeout_retries_once_then_504(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client)
    calls: list[dict] = []

    def fake(**kwargs):
        calls.append(kwargs)
        raise httpx.ReadTimeout("read timed out")

    monkeypatch.setattr(parser, "_chat_completion", fake)

    response = _parse(client)

    assert response.status_code == 504
    assert response.json()["code"] == "UPSTREAM_TIMEOUT"
    assert len(calls) == 2


def test_parse_text_connect_error_retries_once_then_502(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client)
    calls: list[dict] = []

    def fake(**kwargs):
        calls.append(kwargs)
        raise httpx.ConnectError("no route")

    monkeypatch.setattr(parser, "_chat_completion", fake)

    response = _parse(client)

    assert response.status_code == 502
    assert response.json()["code"] == "UPSTREAM_REJECTED"
    assert len(calls) == 2


def test_parse_text_recovers_on_retry(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client)
    calls: list[dict] = []

    def fake(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise httpx.ConnectTimeout("connect timed out")
        return httpx.Response(200, json={"choices": [{"message": {"content": VALID_JSON}}]})

    monkeypatch.setattr(parser, "_chat_completion", fake)

    response = _parse(client)

    assert response.status_code == 200
    assert len(calls) == 2


def test_parse_text_upstream_500_is_502_without_retry_or_leak(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _configure(client)
    calls: list[dict] = []

    def fake(**kwargs):
        calls.append(kwargs)
        return httpx.Response(500, json={"error": {"message": "upstream boom sk-test-secret-key"}})

    monkeypatch.setattr(parser, "_chat_completion", fake)

    response = _parse(client)

    assert response.status_code == 502
    assert response.json()["code"] == "UPSTREAM_REJECTED"
    assert "sk-test-secret-key" not in response.text
    assert len(calls) == 1


def test_parse_text_401_never_echoes_body_or_key(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client)

    def fake(**kwargs):
        return httpx.Response(401, json={"error": {"message": "bad key sk-test-secret-key"}})

    monkeypatch.setattr(parser, "_chat_completion", fake)

    response = _parse(client)

    assert response.status_code == 502
    assert response.json()["code"] == "UPSTREAM_REJECTED"
    assert "sk-test-secret-key" not in response.text
    assert "bad key" not in response.text


def test_parse_text_non_json_is_502_model_output_invalid(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _configure(client)
    _mock_chat(monkeypatch, content="抱歉，我无法完成这个请求。")

    response = _parse(client)

    assert response.status_code == 502
    assert response.json()["code"] == "MODEL_OUTPUT_INVALID"
    assert "抱歉" not in response.json()["message"]


def test_parse_text_strips_json_code_fence(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client)
    _mock_chat(monkeypatch, content="```json\n" + VALID_JSON + "\n```")

    response = _parse(client)

    assert response.status_code == 200, response.text
    assert response.json()["role"] == "高级前端工程师"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(1.7, 1.0), (-0.2, 0.0), ("0.5", 0.5), (None, 0.0)],
)
def test_parse_text_clamps_confidence(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, raw, expected: float
) -> None:
    _configure(client)
    payload = {
        "role": "前端工程师",
        "company": "",
        "tags": [],
        "sourceUrl": "",
        "parseConfidence": raw,
        "extracted": [],
    }
    _mock_chat(monkeypatch, content=json.dumps(payload))

    response = _parse(client)

    assert response.status_code == 200, response.text
    assert response.json()["parseConfidence"] == pytest.approx(expected)


def test_parse_text_missing_fields_are_blank(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client)
    _mock_chat(monkeypatch, content='{"company":"美团"}')

    response = _parse(client)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == ""
    assert body["tags"] == []
    assert body["extracted"] == []
    assert body["sourceUrl"] is None
    assert body["body"] == INPUT_TEXT


def test_parse_text_empty_text_is_422(client: TestClient) -> None:
    response = _parse(client, text="   ")

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"
