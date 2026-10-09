"""POST /speech/transcribe 与时间戳口径的端到端契约（不触发真实网络）。

云端调用被替换成内存桩；这里验证的是：未配置 Key 的可区分错误码、音频只走内存
不落盘、时间戳口径的语速/停顿、以及拿不到时间戳时退回「字数 ÷ 时长」。
"""

from __future__ import annotations

import base64
import tempfile
from typing import Any

from sqlalchemy.orm import Session

from app.modules.speech import service as speech_service
from app.modules.speech.dashscope_asr import TimedUnit, TranscriptionResult
from app.modules.speech.models import SpeechSegment

AUDIO_BYTES = b"RIFF-fake-webm-audio-bytes"
AUDIO_BASE64 = base64.b64encode(AUDIO_BYTES).decode("ascii")


def fake_result(words: tuple[TimedUnit, ...]) -> TranscriptionResult:
    return TranscriptionResult(transcript="你好世界", duration_seconds=3.834, words=words)


def configure_speech(client) -> None:
    response = client.put("/speech/config", json={"apiKey": "sk-speech-test"})
    assert response.status_code == 200, response.text


def test_transcribe_without_key_returns_model_not_configured(client, monkeypatch) -> None:
    called: list[dict[str, Any]] = []
    monkeypatch.setattr(speech_service.dashscope_asr, "transcribe_audio", lambda **kwargs: called.append(kwargs) or fake_result(()))

    response = client.post("/speech/transcribe", json={"audioBase64": AUDIO_BASE64})

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "MODEL_NOT_CONFIGURED"
    assert "API Key" in body["message"]
    # 没有 Key 就不该发起任何上游调用。
    assert called == []


def test_transcribe_invalid_base64_is_rejected_without_upstream_call(client, monkeypatch) -> None:
    configure_speech(client)
    called: list[int] = []
    monkeypatch.setattr(speech_service.dashscope_asr, "transcribe_audio", lambda **kwargs: called.append(1) or fake_result(()))

    response = client.post("/speech/transcribe", json={"audioBase64": "!!!not-base64!!!"})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"
    assert called == []


def test_transcribe_returns_timestamps_and_never_writes_audio_to_disk(client, monkeypatch, tmp_path) -> None:
    configure_speech(client)
    captured: dict[str, Any] = {}

    def fake_transcribe(**kwargs):
        captured.update(kwargs)
        return fake_result((TimedUnit("你好", 0, 800), TimedUnit("世界", 2200, 3834)))

    monkeypatch.setattr(speech_service.dashscope_asr, "transcribe_audio", fake_transcribe)
    # 文件系统哨兵：把临时目录指向空目录，处理完必须仍然为空。
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))

    response = client.post(
        "/speech/transcribe",
        json={"audioBase64": AUDIO_BASE64, "contentType": "audio/webm", "filename": "../../evil name.webm"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body == {
        "transcript": "你好世界",
        "durationSeconds": 3.834,
        "words": [
            {"text": "你好", "beginMs": 0, "endMs": 800},
            {"text": "世界", "beginMs": 2200, "endMs": 3834},
        ],
        "provider": "dashscope",
    }
    # 音频只以内存字节进入客户端，且文件名被清洗（没有路径穿越）。
    assert captured["audio"] == AUDIO_BYTES
    assert captured["filename"] == "evil_name.webm"
    assert list(tmp_path.iterdir()) == []


def test_segments_use_real_timestamps_for_pause_and_pace(client, db_session: Session) -> None:
    # 8 个字；两个时间单元间隔 1000ms > 600ms 记一次停顿；发声跨度 4s。
    response = client.post(
        "/speech/segments",
        json={
            "durationSeconds": 10,
            "transcript": "一二三四五六七八",
            "provider": "dashscope",
            "words": [
                {"text": "一二三四", "beginMs": 0, "endMs": 1000},
                {"text": "五六七八", "beginMs": 2000, "endMs": 4000},
            ],
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["pauseCount"] == 1
    assert body["timingSource"] == "timestamps"
    assert body["speechDurationSeconds"] == 4.0
    # 8 字 / 4 秒 = 120 字/分，用的是发声跨度而不是 10 秒录音时长。
    assert body["paceCharsPerMin"] == 120
    assert body["provider"] == "dashscope"

    stored = db_session.query(SpeechSegment).filter_by(id=body["id"]).one()
    assert stored.timing_source == "timestamps"
    assert stored.speech_duration_seconds == 4.0


def test_segments_without_timestamps_fall_back_to_duration(client, db_session: Session) -> None:
    response = client.post(
        "/speech/segments",
        json={"durationSeconds": 5, "transcript": "一二三四五六七八九十"},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["timingSource"] == "duration"
    assert body["speechDurationSeconds"] is None
    assert body["paceCharsPerMin"] == 120

    stored = db_session.query(SpeechSegment).filter_by(id=body["id"]).one()
    assert stored.timing_source == "duration"
    assert stored.speech_duration_seconds is None


def test_single_timed_unit_has_no_measurable_pause(client) -> None:
    response = client.post(
        "/speech/segments",
        json={
            "durationSeconds": 4,
            "transcript": "一句话",
            "words": [{"text": "一句话", "beginMs": 0, "endMs": 3000}],
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    # 只有一个单元测不出「相邻间隔」，如实给 null 而不是 0。
    assert body["pauseCount"] is None
    assert body["timingSource"] == "duration"
