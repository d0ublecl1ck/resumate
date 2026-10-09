"""POST /speech/synthesize 与 Qwen-TTS 客户端的契约（httpx.MockTransport 写死，不访问外网）。

覆盖：成功链路与请求体、401 拒绝、超时、畸形响应、临时音频 URL 过期/取不到、
未配置 Key 的可区分错误码，以及「服务端取回音频字节、不外泄临时 URL」这一出口。
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from app.modules.speech import dashscope_tts
from app.modules.speech import service as speech_service
from app.shared.errors import ModelOutputInvalid, UpstreamRejected, UpstreamTimeout

BASE = "https://dashscope.aliyuncs.com/api/v1"
AUDIO_URL = "https://audio.example.com/tts/a.wav"
AUDIO_BYTES = b"RIFF-fake-wav-bytes"

RESPONSE_PAYLOAD: dict[str, Any] = {
    "output": {
        "audio": {"url": AUDIO_URL, "expires_at": 4_102_444_800, "id": "audio_test"},
        "finish_reason": "stop",
    },
    "usage": {"characters": 12},
}


def handler(*, captured: dict[str, Any] | None = None, audio_status: int = 200, payload: dict[str, Any] | None = None):
    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/services/aigc/multimodal-generation/generation"):
            if captured is not None:
                captured["body"] = request.read().decode("utf-8")
                captured["auth"] = request.headers.get("authorization")
            return httpx.Response(200, json=payload if payload is not None else RESPONSE_PAYLOAD)
        if request.url.host == "audio.example.com":
            if captured is not None:
                captured["download"] = str(request.url)
            if audio_status >= 400:
                return httpx.Response(audio_status, text="expired signature")
            return httpx.Response(200, content=AUDIO_BYTES, headers={"Content-Type": "audio/wav"})
        raise AssertionError(f"unexpected request {request.method} {request.url}")

    return respond


def client_for(fn) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(fn))


def run_synthesize(client: httpx.Client, **overrides):
    kwargs: dict[str, Any] = {
        "text": "这是一段语音播报测试。",
        "api_key": "sk-tts-contract",
        "base_url": BASE,
        "client": client,
    }
    kwargs.update(overrides)
    return dashscope_tts.synthesize(**kwargs)


def configure_speech(client) -> None:
    response = client.put("/speech/config", json={"apiKey": "sk-tts-test"})
    assert response.status_code == 200, response.text


def test_synthesize_posts_contract_and_returns_audio_bytes() -> None:
    captured: dict[str, Any] = {}
    client = client_for(handler(captured=captured))

    result = run_synthesize(client)

    assert result.audio == AUDIO_BYTES
    assert result.content_type == "audio/wav"
    assert result.provider == "dashscope"
    # 请求体是官方契约：model + input.text + input.voice；用 Bearer 带上 Key。
    assert captured["auth"] == "Bearer sk-tts-contract"
    body = json.loads(captured["body"])
    assert body == {"model": "qwen3-tts-flash", "input": {"text": "这是一段语音播报测试。", "voice": "Cherry"}}
    # 服务端确实取回了临时 URL，而不是把它返回给调用方。
    assert captured["download"] == AUDIO_URL
    client.close()


def test_synthesize_maps_401_without_leaking_upstream_body_or_key() -> None:
    def reject(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"code": "InvalidApiKey", "message": "raw upstream secret"})

    client = client_for(reject)
    with pytest.raises(UpstreamRejected) as error:
        run_synthesize(client)
    client.close()

    message = str(error.value)
    assert message == "语音播报服务拒绝凭证，请检查 API Key 与地域配置"
    assert "raw upstream secret" not in message
    assert "InvalidApiKey" not in message
    assert "sk-tts-contract" not in message


def test_synthesize_maps_timeout_to_upstream_timeout() -> None:
    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    client = client_for(slow)
    with pytest.raises(UpstreamTimeout):
        run_synthesize(client)
    client.close()


def test_synthesize_maps_malformed_response_to_model_output_invalid() -> None:
    client = client_for(handler(payload={"output": {"audio": {}}}))
    with pytest.raises(ModelOutputInvalid) as error:
        run_synthesize(client)
    client.close()
    assert str(error.value) == "语音播报返回内容无法解析"


def test_synthesize_maps_expired_download_to_retryable_rejection() -> None:
    client = client_for(handler(audio_status=403))
    with pytest.raises(UpstreamRejected) as error:
        run_synthesize(client)
    client.close()
    assert str(error.value) == "语音播报音频链接已取不到，请重试"


def test_synthesize_rejects_expired_link_before_downloading() -> None:
    captured: dict[str, Any] = {}
    client = client_for(handler(captured=captured))

    with pytest.raises(UpstreamRejected):
        # expires_at 在 now 之前：本地即可判定过期，不应再去下载。
        run_synthesize(client, now=4_102_444_801)

    assert "download" not in captured
    client.close()


def test_synthesize_without_key_returns_model_not_configured(client, monkeypatch) -> None:
    called: list[int] = []
    monkeypatch.setattr(
        speech_service.dashscope_tts,
        "synthesize",
        lambda **kwargs: called.append(1) or dashscope_tts.SynthesizedAudio(audio=AUDIO_BYTES, content_type="audio/wav"),
    )

    response = client.post("/speech/synthesize", json={"text": "请播报这道题"})

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "MODEL_NOT_CONFIGURED"
    assert "API Key" in body["message"]
    assert called == []


def test_synthesize_endpoint_returns_audio_binary_and_never_url(client, monkeypatch) -> None:
    configure_speech(client)
    captured: dict[str, Any] = {}

    def fake_synthesize(**kwargs):
        captured.update(kwargs)
        return dashscope_tts.SynthesizedAudio(audio=AUDIO_BYTES, content_type="audio/wav")

    monkeypatch.setattr(speech_service.dashscope_tts, "synthesize", fake_synthesize)

    response = client.post("/speech/synthesize", json={"text": "  请播报这道题  "})

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("audio/wav")
    assert response.content == AUDIO_BYTES
    # 文本被 trim；Key 与音色来自配置与默认值。
    assert captured["text"] == "请播报这道题"
    assert captured["voice"] == "Cherry"
    assert captured["api_key"] == "sk-tts-test"


def test_synthesize_rejects_unsupported_format_and_blank_text(client) -> None:
    client.put("/speech/config", json={"apiKey": "sk-tts-test"})

    unsupported = client.post("/speech/synthesize", json={"text": "题目", "format": "mp3"})
    assert unsupported.status_code == 422

    blank = client.post("/speech/synthesize", json={"text": "   "})
    assert blank.status_code == 422


def test_synthesize_maps_upstream_timeout_to_504(client, monkeypatch) -> None:
    configure_speech(client)

    def slow(**kwargs):
        raise UpstreamTimeout("语音播报超时，请稍后重试")

    monkeypatch.setattr(speech_service.dashscope_tts, "synthesize", slow)

    response = client.post("/speech/synthesize", json={"text": "题目"})

    assert response.status_code == 504
    assert response.json()["code"] == "UPSTREAM_TIMEOUT"
