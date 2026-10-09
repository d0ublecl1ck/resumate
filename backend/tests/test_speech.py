"""语音指标：语速计算、空转写、时长为 0 边界、按会话读回与「无音频」契约。

指标只由真实时长 + 真实转写推导；无法测量的分支返回 null，由报告侧显示「不适用」。
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.modules.interview.models import InterviewQuestion, InterviewSession
from app.modules.speech import service as speech_service
from app.modules.speech.models import SpeechSegment

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
OWNER = "user_test"


def seed_interview(db: Session) -> None:
    """落一场会话与一道题，用于校验 sessionId/questionId 回指。"""
    db.add(
        InterviewSession(
            id="ivs_speech",
            owner_id=OWNER,
            resume_id="res_speech",
            resume_version_id="ver_speech",
            jd_id="jd_speech",
            role="Java 后端",
            status="active",
            rubric_version="interview-rubric-v1",
            context_snapshot={},
            created_at=NOW,
            updated_at=NOW,
            completed_at=None,
        )
    )
    db.add(
        InterviewQuestion(
            id="ivq_speech",
            session_id="ivs_speech",
            ordinal=1,
            kind="technical",
            prompt="讲讲你做过的一次接口优化。",
            reference_points=[],
            parent_question_id=None,
            derived_from_answer_id=None,
            created_at=NOW,
        )
    )
    db.commit()


def test_pace_is_transcript_chars_per_minute(client, db_session: Session) -> None:
    seed_interview(db_session)
    # 10 个字 / 5 秒 = 120 字/分。
    response = client.post(
        "/speech/segments",
        json={
            "durationSeconds": 5,
            "transcript": "一二三四五六七八九十",
            "sessionId": "ivs_speech",
            "questionId": "ivq_speech",
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["durationSeconds"] == 5
    assert body["charCount"] == 10
    assert body["paceCharsPerMin"] == 120
    assert body["sessionId"] == "ivs_speech"
    assert body["questionId"] == "ivq_speech"

    stored = db_session.query(SpeechSegment).filter_by(id=body["id"]).one()
    assert stored.owner_id == OWNER
    assert stored.char_count == 10
    assert stored.pace_chars_per_min == 120


def test_empty_transcript_keeps_metrics_unmeasured(client, db_session: Session) -> None:
    response = client.post("/speech/segments", json={"durationSeconds": 12, "transcript": "   "})

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["charCount"] == 0
    # 空转写不产生 0 字/分，而是「无法测量」。
    assert body["paceCharsPerMin"] is None
    assert body["clarityScore"] is None
    assert body["clarityLevel"] is None

    stored = db_session.query(SpeechSegment).filter_by(id=body["id"]).one()
    assert stored.pace_chars_per_min is None
    assert stored.clarity_score is None


def test_zero_duration_is_rejected_not_faked(client, db_session: Session) -> None:
    response = client.post("/speech/segments", json={"durationSeconds": 0, "transcript": "有转写但没有时长"})

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_FAILED"
    # 绝不为 0 时长伪造指标：不落任何行。
    assert db_session.query(SpeechSegment).count() == 0


def test_compute_pace_and_clarity_boundaries() -> None:
    assert speech_service.compute_pace(10, 0) is None
    assert speech_service.compute_pace(0, 10) is None
    assert speech_service.compute_pace(10, 5) == 120
    assert speech_service.compute_clarity(0, 0, 10, None) == (None, None)
    assert speech_service.compute_clarity(10, 0, 10, 0) is not None


def test_fillers_and_pauses_lower_clarity(client, db_session: Session) -> None:
    # 7 个字里 4 个填充词（嗯 + 那个×3）：填充词率约 57.1%，扣满 60 分 -> 40 分 / needs_work。
    response = client.post(
        "/speech/segments",
        json={"durationSeconds": 6, "transcript": "嗯那个那个那个", "pauseCount": 0},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["charCount"] == 7
    assert body["fillerCount"] == 4
    assert body["clarityScore"] == 40
    assert body["clarityLevel"] == "needs_work"


def test_list_segments_reads_back_by_session(client, db_session: Session) -> None:
    seed_interview(db_session)
    for seconds, transcript in ((4, "第一段真实转写"), (8, "第二段真实转写文本")):
        created = client.post(
            "/speech/segments",
            json={"durationSeconds": seconds, "transcript": transcript, "sessionId": "ivs_speech"},
        )
        assert created.status_code == 201

    response = client.get("/speech/segments", params={"sessionId": "ivs_speech"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert [item["transcript"] for item in body] == ["第一段真实转写", "第二段真实转写文本"]
    assert all(item["sessionId"] == "ivs_speech" for item in body)
    assert body[0]["paceCharsPerMin"] is not None


def test_no_audio_returns_empty_list_for_report_to_show_not_applicable(client, db_session: Session) -> None:
    seed_interview(db_session)

    response = client.get("/speech/segments", params={"sessionId": "ivs_speech"})

    assert response.status_code == 200
    # 没有音频记录 -> 空列表；报告表达维度据此显示「不适用」，绝不回落到写死数字。
    assert response.json() == []


def test_foreign_session_reference_is_not_found(client, db_session: Session) -> None:
    response = client.post(
        "/speech/segments",
        json={"durationSeconds": 5, "transcript": "真实转写", "sessionId": "ivs_missing"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"
    assert db_session.query(SpeechSegment).count() == 0
