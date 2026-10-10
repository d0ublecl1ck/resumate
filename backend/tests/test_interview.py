"""基于 JD 的 AI 模拟面试：会话冻结、题目生成、幂等作答、追问与结构化评估。

模型侧一律 monkeypatch app.modules.interview.llm.chat_json，测试不访问外网。
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from app.modules.interview import llm as interview_llm
from app.modules.interview import service as interview_service
from app.modules.interview.models import (
    InterviewAnswer,
    InterviewQuestion,
    InterviewReport,
    InterviewSession,
)
from app.modules.jd.models import JobDescription
from app.modules.resume.models import Resume, ResumeVersion

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
OWNER = "user_test"
OLD_JD_BODY = "负责 C 端核心页面开发；要求精通 React 与 TypeScript。"

QUESTION_PAYLOAD = {
    "questions": [
        {
            "kind": "technical",
            "prompt": "React 并发渲染解决了什么问题？",
            "referencePoints": ["可中断渲染", "优先级调度"],
        },
        {
            "kind": "behavioral",
            "prompt": "讲一次你推动性能优化的经历。",
            "referencePoints": ["背景", "指标", "结果"],
        },
        {
            "kind": "situational",
            "prompt": "线上首屏突然变慢，你怎么排查？",
            "referencePoints": ["定位", "回滚", "复盘"],
        },
    ]
}

FOLLOW_UP_PAYLOAD = {
    "followUp": "你提到优先级调度，能说说时间切片的实现吗？",
    "missingPoints": ["时间切片实现"],
}

REPORT_PAYLOAD = {
    "contentScores": [
        {"dimension": "correctness", "score": 86, "evidence": ["我把低优先级更新让出去了"]},
        {"dimension": "depth", "score": 72, "evidence": ["时间切片把长任务拆成 5ms 的小块"]},
        {"dimension": "rigor", "score": 30, "evidence": []},
        {"dimension": "fit", "score": 90, "evidence": ["LCP 降了 40%"]},
    ],
    "summary": "基础扎实，深度待补。",
    "highlights": ["有真实性能数据"],
    "gaps": ["原理深度不足"],
    "suggestions": ["补充并发渲染原理"],
}


def seed_context(db: Session) -> None:
    """直接落库一份简历版本与一条 JD，避开无关模块的建资源流程。"""
    db.add(
        Resume(
            id="res_test",
            owner_id=OWNER,
            profile_id=None,
            title="前端工程师简历",
            target_role="高级前端工程师",
            tags=["前端"],
            template_id="tpl_modern",
            template_version=1,
            current_version_id="ver_test",
            lifecycle="active",
            save_state="committed",
            document={},
            created_at=NOW,
            updated_at=NOW,
        )
    )
    db.add(
        ResumeVersion(
            id="ver_test",
            resume_id="res_test",
            source="manual",
            actor_id=OWNER,
            message="",
            change_count=0,
            affected_sections=[],
            snapshot={"basics": {"name": "示例同学", "title": "高级前端工程师"}},
            started_at=NOW,
            committed_at=NOW,
        )
    )
    db.add(
        JobDescription(
            id="jd_test",
            owner_id=OWNER,
            role="高级前端工程师",
            company="某科技",
            body=OLD_JD_BODY,
            source_url=None,
            tags=["前端"],
            revision=1,
            bound_resume_id=None,
            created_at=NOW,
            updated_at=NOW,
        )
    )
    db.commit()


def patch_llm(
    monkeypatch: pytest.MonkeyPatch,
    *,
    questions: dict | None = None,
    follow_up: dict | None = None,
    report: dict | None = None,
) -> list[str]:
    """按 system prompt 分派三类调用；返回实际收到的 system prompt 列表。"""
    calls: list[str] = []

    def fake(db, owner_id, *, system_prompt, user_prompt, max_tokens=None, client=None):
        calls.append(system_prompt)
        if "评估" in system_prompt:
            return report if report is not None else REPORT_PAYLOAD
        if "追问" in system_prompt:
            return follow_up if follow_up is not None else FOLLOW_UP_PAYLOAD
        return questions if questions is not None else QUESTION_PAYLOAD

    monkeypatch.setattr(interview_llm, "chat_json", fake)
    return calls


def create_session(client, question_count: int = 3):
    response = client.post(
        "/interview/sessions",
        json={
            "resumeVersionId": "ver_test",
            "jdId": "jd_test",
            "role": "高级前端工程师",
            "questionCount": question_count,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_session_freezes_context_and_generates_questions(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    calls = patch_llm(monkeypatch)

    body = create_session(client)

    assert body["status"] == "active"
    assert body["rubricVersion"] == interview_service.RUBRIC_VERSION
    assert [item["kind"] for item in body["questions"]] == ["technical", "behavioral", "situational"]
    assert body["questions"][0]["referencePoints"] == ["可中断渲染", "优先级调度"]
    assert body["questions"][0]["answer"] is None
    assert body["report"] is None
    assert calls and "面试官" in calls[0]

    snapshot = body["contextSnapshot"]
    assert snapshot["role"] == "高级前端工程师"
    assert snapshot["resumeTitle"] == "前端工程师简历"
    assert snapshot["resumeVersionId"] == "ver_test"
    assert snapshot["jdRole"] == "高级前端工程师"
    assert snapshot["jdCompany"] == "某科技"
    assert snapshot["jdBody"] == OLD_JD_BODY

    # 冻结语义：改掉 JD 正文后，已建会话仍返回创建时的快照。
    jd = db_session.get(JobDescription, "jd_test")
    assert jd is not None
    jd.body = "改过的 JD 正文"
    jd.role = "改过的岗位"
    db_session.commit()

    detail = client.get(f"/interview/sessions/{body['id']}")
    assert detail.status_code == 200
    assert detail.json()["contextSnapshot"]["jdBody"] == OLD_JD_BODY
    assert detail.json()["contextSnapshot"]["jdRole"] == "高级前端工程师"

    row = db_session.get(InterviewSession, body["id"])
    assert row is not None
    assert row.context_snapshot["resumeSnapshot"]["basics"]["name"] == "示例同学"


def test_create_session_requires_model_config(client, db_session: Session) -> None:
    seed_context(db_session)

    response = client.post(
        "/interview/sessions",
        json={"resumeVersionId": "ver_test", "jdId": "jd_test", "role": "高级前端工程师"},
    )

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "MODEL_NOT_CONFIGURED"
    assert body["message"]
    assert "Traceback" not in body["message"]
    # 失败时必须整体回滚，不留半场会话。
    assert db_session.query(InterviewSession).count() == 0
    assert db_session.query(InterviewQuestion).count() == 0


def test_create_session_rejects_unknown_resume_version(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)

    response = client.post(
        "/interview/sessions",
        json={"resumeVersionId": "ver_missing", "jdId": "jd_test", "role": "高级前端工程师"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_invalid_model_output_returns_stable_error(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch, questions={"questions": [{"kind": "technical", "prompt": "只有一题", "referencePoints": []}]})

    response = client.post(
        "/interview/sessions",
        json={"resumeVersionId": "ver_test", "jdId": "jd_test", "role": "高级前端工程师"},
    )

    assert response.status_code == 502
    assert response.json()["code"] == "MODEL_OUTPUT_INVALID"


def test_answer_is_idempotent_and_follow_up_created_once(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)
    question = session["questions"][0]
    payload = {"questionId": question["id"], "content": "我用 useDeferredValue 把低优先级更新让出去了。"}

    first = client.post(f"/interview/sessions/{session['id']}/answers", json=payload)
    assert first.status_code == 200, first.text
    follow_up = first.json()["followUpQuestion"]
    assert follow_up is not None
    assert follow_up["kind"] == "follow_up"
    assert follow_up["parentQuestionId"] == question["id"]
    assert follow_up["referencePoints"] == ["时间切片实现"]

    second = client.post(f"/interview/sessions/{session['id']}/answers", json=payload)
    assert second.status_code == 200
    assert second.json()["answer"]["id"] == first.json()["answer"]["id"]
    assert second.json()["followUpQuestion"]["id"] == follow_up["id"]

    stored = db_session.query(InterviewAnswer).filter_by(question_id=question["id"]).all()
    assert len(stored) == 1
    follow_ups = db_session.query(InterviewQuestion).filter_by(parent_question_id=question["id"]).all()
    assert len(follow_ups) == 1


def test_explicit_idempotency_key_dedupes_replay(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)
    question = session["questions"][1]
    payload = {"questionId": question["id"], "content": "我做过性能优化。", "idempotencyKey": "client-key-1"}

    client.post(f"/interview/sessions/{session['id']}/answers", json=payload)
    client.post(f"/interview/sessions/{session['id']}/answers", json=payload)

    assert db_session.query(InterviewAnswer).filter_by(question_id=question["id"]).count() == 1


def test_answer_to_foreign_question_is_not_found(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)

    response = client.post(
        f"/interview/sessions/{session['id']}/answers",
        json={"questionId": "ivq_not_exists", "content": "随便答一点。"},
    )

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_finish_produces_structured_report_and_freezes_rubric(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)
    for question in session["questions"]:
        answered = client.post(
            f"/interview/sessions/{session['id']}/answers",
            # 回答里必须真的出现报告引用的那句原话，否则该维度会被判为「证据非原话」而不给分。
            json={
                "questionId": question["id"],
                "content": f"针对「{question['prompt']}」的回答：我把低优先级更新让出去了。",
                "idempotencyKey": f"k-{question['id']}",
            },
        )
        assert answered.status_code == 200, answered.text

    finished = client.post(f"/interview/sessions/{session['id']}/finish")
    assert finished.status_code == 200, finished.text
    report = finished.json()

    assert report["rubricVersion"] == interview_service.RUBRIC_VERSION
    assert [item["dimension"] for item in report["contentScores"]] == ["correctness", "depth", "rigor", "fit"]
    assert report["contentScores"][0]["score"] == 86
    assert report["contentScores"][0]["evidence"] == ["我把低优先级更新让出去了"]
    # 没有原话证据的维度不给分（score=null），而不是给 0 分。
    assert report["contentScores"][2] == {"dimension": "rigor", "score": None, "evidence": []}
    assert report["summary"] == "基础扎实，深度待补。"
    assert report["highlights"] == ["有真实性能数据"]
    assert report["gaps"] == ["原理深度不足"]
    assert report["suggestions"] == ["补充并发渲染原理"]

    stored = db_session.get(InterviewReport, report["id"])
    assert stored is not None
    assert stored.rubric_version == "interview-rubric-v1"
    assert db_session.get(InterviewSession, session["id"]).status == "completed"

    again = client.post(f"/interview/sessions/{session['id']}/finish")
    assert again.status_code == 200
    assert again.json()["id"] == report["id"]

    fetched = client.get(f"/interview/sessions/{session['id']}/report")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == report["id"]

    detail = client.get(f"/interview/sessions/{session['id']}").json()
    assert detail["status"] == "completed"
    assert detail["report"]["id"] == report["id"]


def test_report_withholds_score_when_model_cites_non_verbatim_evidence(client, db_session: Session, monkeypatch) -> None:
    """模型引用的「原话」如果不在作答里，该维度不给分——这是可解释评分的硬契约。"""
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)
    for question in session["questions"]:
        client.post(
            f"/interview/sessions/{session['id']}/answers",
            json={"questionId": question["id"], "content": "这一题我按常规做法处理。"},
        )

    finished = client.post(f"/interview/sessions/{session['id']}/finish")
    assert finished.status_code == 502, finished.text
    assert finished.json()["code"] == "MODEL_OUTPUT_INVALID"


def test_answer_after_finish_is_rejected(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)
    question = session["questions"][0]
    client.post(
        f"/interview/sessions/{session['id']}/answers",
        json={"questionId": question["id"], "content": "先答一题：我把低优先级更新让出去了。"},
    )
    assert client.post(f"/interview/sessions/{session['id']}/finish").status_code == 200

    response = client.post(
        f"/interview/sessions/{session['id']}/answers",
        json={"questionId": session["questions"][1]["id"], "content": "结束后还想答。"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "RUN_STATE_CONFLICT"


def test_finish_without_answers_is_rejected(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)

    response = client.post(f"/interview/sessions/{session['id']}/finish")

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_list_sessions_summarises_progress(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)
    client.post(
        f"/interview/sessions/{session['id']}/answers",
        json={"questionId": session["questions"][0]["id"], "content": "答第一题。"},
    )

    response = client.get("/interview/sessions")

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["id"] == session["id"]
    # 作答主问题后追加了一条追问，所以题目总数是 3 + 1，已答数仍是 1。
    assert items[0]["questionCount"] == 4
    assert items[0]["answeredCount"] == 1
    assert items[0]["resumeTitle"] == "前端工程师简历"
    assert items[0]["hasReport"] is False
