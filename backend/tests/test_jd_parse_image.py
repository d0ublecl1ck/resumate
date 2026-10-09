"""/jds:parse-image：岗位截图交给视觉模型结构化成草案（issue e0457）。

覆盖：MockTransport 成功与请求体（image_url data URL）、401、超时、畸形输出、
模型不支持图像（MODEL_NO_VISION）、未配置、超大体积、非法类型。图片只走内存，
草案不落库。
"""

from __future__ import annotations

import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.jd import parser, vision
from app.modules.jd.schemas import MAX_IMAGE_BYTES, JdImageParseRequest
from app.shared.errors import ValidationFailed

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"fake-jd-pixels"
PNG_BASE64 = base64.b64encode(PNG_BYTES).decode("ascii")

VISION_CONFIG = {
    "provider": "openai",
    "endpoint": "https://api.example.com/v1",
    "model": "gpt-4o",
    "apiKey": "sk-test-secret-key",
}
NON_VISION_CONFIG = {
    "provider": "deepseek",
    "endpoint": "https://api.deepseek.com/v1",
    "model": "deepseek-flash",
    "apiKey": "sk-test-secret-key",
}

VALID_JSON = json.dumps(
    {
        "role": "高级前端工程师",
        "company": "美团",
        "tags": ["前端", "性能优化"],
        "sourceUrl": "https://example.com/jobs/9",
        "body": "负责核心交易链路的前端架构与性能优化。",
        "parseConfidence": 0.81,
        "extracted": [{"label": "岗位", "value": "高级前端工程师"}],
    },
    ensure_ascii=False,
)


def _configure(client: TestClient, config: dict) -> None:
    response = client.put("/models/config", json=config)
    assert response.status_code == 200, response.text


def _mock_chat(monkeypatch: pytest.MonkeyPatch, *, content: str) -> list[dict]:
    calls: list[dict] = []

    def fake(**kwargs):
        calls.append(kwargs)
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})

    monkeypatch.setattr(parser, "_chat_completion", fake)
    return calls


def _parse(client: TestClient, *, image_base64: str = PNG_BASE64, content_type: str = "image/png"):
    payload: dict = {"imageBase64": image_base64}
    if content_type:
        payload["contentType"] = content_type
    return client.post("/jds:parse-image", json=payload)


def test_vision_detection_is_conservative() -> None:
    assert vision.model_supports_vision(provider="openai", model="gpt-4o") is True
    assert vision.model_supports_vision(provider="anthropic", model="claude-sonnet-4-5") is True
    assert vision.model_supports_vision(provider="deepseek", model="deepseek-v4-flash-vision-exp") is True
    assert vision.model_supports_vision(provider="zhipuai", model="glm-4.6v") is True
    # 未知 / 纯文本模型保守判 False，避免把图片发出去再吃上游 4xx。
    assert vision.model_supports_vision(provider="deepseek", model="deepseek-flash") is False
    assert vision.model_supports_vision(provider="custom", model="my-text-model") is False


def test_parse_image_sends_data_url_and_returns_model_body(client: TestClient, db_session: Session) -> None:
    _configure(client, VISION_CONFIG)
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["body"] = json.loads(request.read())
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"choices": [{"message": {"content": VALID_JSON}}]})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    try:
        result = parser.parse_jd_image(
            db_session,
            "user_test",
            payload=JdImageParseRequest(image_base64=PNG_BASE64, content_type="image/png"),
            client=http,
        )
    finally:
        http.close()

    assert result.role == "高级前端工程师"
    assert result.body == "负责核心交易链路的前端架构与性能优化。"
    assert result.input_source == "image"
    assert result.note == parser.IMAGE_PARSE_NOTE
    assert result.parse_confidence == pytest.approx(0.81)

    sent = captured["body"]
    assert sent["model"] == "gpt-4o"
    assert captured["auth"] == "Bearer sk-test-secret-key"
    content = sent["messages"][1]["content"]
    assert content[0]["type"] == "text"
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"] == "data:image/png;base64," + PNG_BASE64


def test_parse_image_endpoint_returns_draft(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client, VISION_CONFIG)
    calls = _mock_chat(monkeypatch, content=VALID_JSON)

    response = _parse(client)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["inputSource"] == "image"
    assert body["body"] == "负责核心交易链路的前端架构与性能优化。"
    assert body["note"] == parser.IMAGE_PARSE_NOTE
    # 真的用了用户配置的模型，而不是启发式。
    assert calls and calls[0]["payload"]["model"] == "gpt-4o"


def test_parse_image_without_vision_is_409_and_no_upstream_call(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _configure(client, NON_VISION_CONFIG)
    calls: list[int] = []
    monkeypatch.setattr(parser, "_chat_completion", lambda **kwargs: calls.append(1))

    response = _parse(client)

    assert response.status_code == 409
    assert response.json()["code"] == "MODEL_NO_VISION"
    assert "模型配置" in response.json()["message"]
    assert calls == []


def test_parse_image_without_model_is_409(client: TestClient) -> None:
    response = _parse(client)

    assert response.status_code == 409
    assert response.json()["code"] == "MODEL_NOT_CONFIGURED"


def test_parse_image_401_is_502_without_leak(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client, VISION_CONFIG)

    def fake(**kwargs):
        return httpx.Response(401, json={"error": {"message": "bad key sk-test-secret-key"}})

    monkeypatch.setattr(parser, "_chat_completion", fake)

    response = _parse(client)

    assert response.status_code == 502
    assert response.json()["code"] == "UPSTREAM_REJECTED"
    assert "sk-test-secret-key" not in response.text
    assert "bad key" not in response.text


def test_parse_image_timeout_retries_once_then_504(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client, VISION_CONFIG)
    calls: list[int] = []

    def fake(**kwargs):
        calls.append(1)
        raise httpx.ReadTimeout("read timed out")

    monkeypatch.setattr(parser, "_chat_completion", fake)

    response = _parse(client)

    assert response.status_code == 504
    assert response.json()["code"] == "UPSTREAM_TIMEOUT"
    assert len(calls) == 2


def test_parse_image_non_json_is_502_model_output_invalid(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _configure(client, VISION_CONFIG)
    _mock_chat(monkeypatch, content="抱歉，我无法识别这张图。")

    response = _parse(client)

    assert response.status_code == 502
    assert response.json()["code"] == "MODEL_OUTPUT_INVALID"
    assert "抱歉" not in response.json()["message"]


def test_parse_image_empty_result_is_502(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client, VISION_CONFIG)
    _mock_chat(monkeypatch, content='{"role":"","body":""}')

    response = _parse(client)

    assert response.status_code == 502
    assert response.json()["code"] == "MODEL_OUTPUT_INVALID"


def test_parse_image_unsupported_type_is_422_without_upstream(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(client, VISION_CONFIG)
    calls: list[int] = []
    monkeypatch.setattr(parser, "_chat_completion", lambda **kwargs: calls.append(1))
    gif = base64.b64encode(b"GIF89a" + b"pixels").decode("ascii")

    response = _parse(client, image_base64=gif, content_type="image/gif")

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"
    assert calls == []


def test_parse_image_invalid_base64_is_422(client: TestClient) -> None:
    _configure(client, VISION_CONFIG)

    response = _parse(client, image_base64="!!!not-base64!!!")

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_decode_image_rejects_oversized_payload() -> None:
    oversized = PNG_BYTES + b"x" * (MAX_IMAGE_BYTES + 1)
    payload = JdImageParseRequest(image_base64=base64.b64encode(oversized).decode("ascii"))

    with pytest.raises(ValidationFailed) as error:
        parser.decode_image(payload)

    assert "图片过大" in str(error.value)
