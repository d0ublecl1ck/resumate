"""DashScope Paraformer 客户端的契约测试（httpx.MockTransport 写死官方 HTTP 契约）。

覆盖：成功五步链路、401 拒绝、超时、畸形响应、无时间戳退回。
这里不打真实网络；真实调用等 API Key 到位后再跑（见仓库文档的命令清单）。
"""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.modules.speech import dashscope_asr
from app.shared.errors import ModelOutputInvalid, UpstreamRejected, UpstreamTimeout

BASE = "https://dashscope.aliyuncs.com/api/v1"
UPLOAD_HOST = "https://upload.example.com"
RESULT_URL = "https://result.example.com/r.json"

POLICY: dict[str, str] = {
    "upload_dir": "dashscope-instant/audio",
    "upload_host": UPLOAD_HOST,
    "oss_access_key_id": "oss-key",
    "signature": "sig",
    "policy": "policy",
    "x_oss_object_acl": "private",
    "x_oss_forbid_overwrite": "true",
}

RESULT: dict[str, Any] = {
    "file_url": "oss://dashscope-instant/audio/answer.webm",
    "properties": {"original_duration_in_milliseconds": 3834},
    "transcripts": [
        {
            "channel_id": 0,
            "text": "你好世界",
            "sentences": [
                {
                    "begin_time": 0,
                    "end_time": 800,
                    "text": "你好",
                    "words": [
                        {"begin_time": 0, "end_time": 400, "text": "你"},
                        {"begin_time": 400, "end_time": 800, "text": "好"},
                    ],
                },
                {
                    "begin_time": 2200,
                    "end_time": 3834,
                    "text": "世界",
                    "words": [
                        {"begin_time": 2200, "end_time": 3000, "text": "世"},
                        {"begin_time": 3000, "end_time": 3834, "text": "界"},
                    ],
                },
            ],
        }
    ],
}


def happy_handler(*, captured: dict[str, Any] | None = None, result: dict[str, Any] | None = None, policies=("PENDING", "SUCCEEDED")):
    polls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if captured is not None:
            captured.setdefault("requests", []).append((request.method, request.url.path))
        if request.method == "GET" and request.url.path.endswith("/uploads"):
            if captured is not None:
                captured["policy_query"] = dict(request.url.params)
                captured["policy_auth"] = request.headers.get("authorization")
            return httpx.Response(200, json={"data": POLICY})
        if request.method == "POST" and request.url.host == "upload.example.com":
            if captured is not None:
                captured["upload_headers"] = dict(request.headers)
                captured["upload_body"] = request.read()
            return httpx.Response(200, text="ok")
        if request.method == "POST" and request.url.path.endswith("/services/audio/asr/transcription"):
            if captured is not None:
                captured["submit_body"] = request.read().decode("utf-8")
                captured["submit_headers"] = dict(request.headers)
            return httpx.Response(200, json={"output": {"task_status": "PENDING", "task_id": "task-1"}})
        if request.method == "GET" and "/tasks/" in request.url.path:
            status = policies[min(polls["count"], len(policies) - 1)]
            polls["count"] += 1
            if status == "SUCCEEDED":
                return httpx.Response(
                    200,
                    json={
                        "output": {
                            "task_status": "SUCCEEDED",
                            "results": [{"subtask_status": "SUCCEEDED", "transcription_url": RESULT_URL}],
                        }
                    },
                )
            return httpx.Response(200, json={"output": {"task_status": status}})
        if request.url.host == "result.example.com":
            return httpx.Response(200, json=result if result is not None else RESULT)
        raise AssertionError(f"unexpected request {request.method} {request.url}")

    return handler


def client_for(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def run_transcribe(client: httpx.Client, **overrides):
    kwargs: dict[str, Any] = {
        "audio": b"fake-audio-bytes",
        "api_key": "sk-contract-test",
        "base_url": BASE,
        "client": client,
        "poll_interval": 0.0,
        "poll_timeout": 5.0,
        "sleep": lambda _seconds: None,
    }
    kwargs.update(overrides)
    return dashscope_asr.transcribe_audio(**kwargs)


def test_transcribe_runs_full_chain_and_returns_word_timestamps() -> None:
    captured: dict[str, Any] = {}
    client = client_for(happy_handler(captured=captured))

    result = run_transcribe(client)

    assert result.transcript == "你好世界"
    assert result.duration_seconds == 3.834
    assert result.provider == "dashscope"
    assert [(unit.text, unit.begin_ms, unit.end_ms) for unit in result.words] == [
        ("你", 0, 400),
        ("好", 400, 800),
        ("世", 2200, 3000),
        ("界", 3000, 3834),
    ]
    # 1) 上传凭证带上 action/model 与 Bearer；2) multipart 里确实带上音频字节；
    # 3) 提交任务用 oss:// URL、开异步与 OSS 解析头。
    assert captured["policy_query"] == {"action": "getPolicy", "model": "paraformer-v2"}
    assert captured["policy_auth"] == "Bearer sk-contract-test"
    assert b"fake-audio-bytes" in captured["upload_body"]
    assert "oss://dashscope-instant/audio/answer.webm" in captured["submit_body"]
    assert captured["submit_headers"]["x-dashscope-async"] == "enable"
    assert captured["submit_headers"]["x-dashscope-ossresourceresolve"] == "enable"
    client.close()


def test_transcribe_returns_no_words_when_upstream_has_no_timestamps() -> None:
    result_without_times = {
        "properties": {"original_duration_in_milliseconds": 2000},
        "transcripts": [{"text": "没有时间戳的转写", "sentences": []}],
    }
    client = client_for(happy_handler(result=result_without_times))

    result = run_transcribe(client)

    assert result.transcript == "没有时间戳的转写"
    assert result.duration_seconds == 2.0
    assert result.words == ()
    client.close()


def test_transcribe_maps_401_without_leaking_upstream_body_or_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"code": "InvalidApiKey", "message": "upstream secret detail"})

    client = client_for(handler)
    with pytest.raises(UpstreamRejected) as error:
        run_transcribe(client)
    client.close()

    message = str(error.value)
    assert message == "语音识别服务拒绝凭证，请检查 API Key 与地域配置"
    assert "upstream secret detail" not in message
    assert "InvalidApiKey" not in message
    assert "sk-contract-test" not in message


def test_transcribe_maps_timeout_to_upstream_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timed out", request=request)

    client = client_for(handler)
    with pytest.raises(UpstreamTimeout):
        run_transcribe(client)
    client.close()


def test_transcribe_maps_malformed_result_to_model_output_invalid() -> None:
    inner = happy_handler()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "result.example.com":
            return httpx.Response(200, text="<html>not json</html>")
        return inner(request)

    client = client_for(handler)
    with pytest.raises(ModelOutputInvalid) as error:
        run_transcribe(client)
    client.close()
    assert str(error.value) == "语音识别返回内容无法解析"


def test_transcribe_maps_failed_task_to_upstream_rejected() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and "/tasks/" in request.url.path:
            return httpx.Response(200, json={"output": {"task_status": "FAILED", "message": "raw upstream failure"}})
        return happy_handler()(request)

    client = client_for(handler)
    with pytest.raises(UpstreamRejected) as error:
        run_transcribe(client)
    client.close()
    assert "raw upstream failure" not in str(error.value)


def test_probe_credentials_reports_rejection_without_raw_body() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"message": "forbidden raw detail"})

    client = client_for(handler)
    ok, message = dashscope_asr.probe_credentials(api_key="sk-bad", base_url=BASE, client=client)
    client.close()

    assert ok is False
    assert message == "语音识别服务拒绝凭证，请检查 API Key 与地域配置"
    assert "forbidden raw detail" not in message


def test_probe_credentials_succeeds_with_policy_response() -> None:
    client = client_for(happy_handler())
    ok, message = dashscope_asr.probe_credentials(api_key="sk-ok", base_url=BASE, client=client)
    client.close()
    assert ok is True
    assert message == "凭据可用"


def test_resolve_base_url_prefers_override_then_region() -> None:
    assert dashscope_asr.resolve_base_url(region="cn-beijing", endpoint="") == "https://dashscope.aliyuncs.com/api/v1"
    assert dashscope_asr.resolve_base_url(region="ap-southeast-1", endpoint="") == "https://dashscope-intl.aliyuncs.com/api/v1"
    assert dashscope_asr.resolve_base_url(region="cn-beijing", endpoint="https://gw.example.com/api/v1/") == "https://gw.example.com/api/v1"
