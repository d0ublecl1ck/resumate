"""面试数据聚合：成长曲线、口径比较、练习项与复测、重新生成、准备洞察。

模型侧一律 monkeypatch app.modules.interview.llm.chat_json，测试不访问外网；
成长曲线的聚合断言直接落真实会话 + 报告行，不依赖模型。
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from app.modules.interview import llm as interview_llm
from app.modules.interview import service as interview_service
from app.modules.interview.models import (
    InterviewAnswer,
    InterviewQuestion,
    InterviewReport,
    InterviewSession,
    PracticeItem,
)
from app.modules.jd.models import JobDescription
from app.modules.resume.models import Resume, ResumeVersion

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
OWNER = "user_test"

QUESTION_PAYLOAD = {
    "questions": [
        {"kind": "technical", "prompt": "React 并发渲染解决了什么问题？", "referencePoints": ["可中断渲染", "优先级调度"]},
        {"kind": "behavioral", "prompt": "讲一次你推动性能优化的经历。", "referencePoints": ["背景", "指标", "结果"]},
        {"kind": "situational", "prompt": "线上首屏突然变慢，你怎么排查？", "referencePoints": ["定位", "回滚", "复盘"]},
    ]
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
    "suggestions": ["补充并发渲染原理", "补一次性能数据"],
}

INSIGHTS_PAYLOAD = {
    "matchPoints": ["简历有 React 性能优化经历", "JD 要求 TypeScript，简历有"],
    "riskPoints": ["缺少大型团队协作经验"],
    "scopeKeywords": ["React", "TypeScript", "性能优化"],
}


def seed_context(db: Session) -> None:
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
            snapshot={"basics": {"name": "张沐", "title": "高级前端工程师"}, "skills": ["React", "TypeScript"]},
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
            body="负责 C 端核心页面开发；要求精通 React 与 TypeScript，有性能优化经验。",
            source_url=None,
            tags=["前端"],
            revision=1,
            bound_resume_id=None,
            created_at=NOW,
            updated_at=NOW,
        )
    )
    db.commit()


def add_completed_session(
    db: Session,
    session_id: str,
    *,
    role: str,
    rubric: str,
    scores: tuple[int, int, int, int],
    created_at: datetime,
    owner_id: str = OWNER,
    with_report: bool = True,
) -> InterviewSession:
    session = InterviewSession(
        id=session_id,
        owner_id=owner_id,
        resume_id="res_test",
        resume_version_id="ver_test",
        jd_id="jd_test",
        role=role,
        status="completed" if with_report else "active",
        rubric_version=rubric,
        context_snapshot={"role": role, "resumeTitle": "前端工程师简历"},
        created_at=created_at,
        updated_at=created_at,
        completed_at=created_at if with_report else None,
    )
    db.add(session)
    for ordinal, kind in enumerate(("technical", "behavioral", "situational"), start=1):
        db.add(
            InterviewQuestion(
                id=f"{session_id}_q{ordinal}",
                session_id=session_id,
                ordinal=ordinal,
                kind=kind,
                prompt=f"题目 {ordinal}",
                reference_points=[],
                parent_question_id=None,
                derived_from_answer_id=None,
                created_at=created_at,
            )
        )
    if with_report:
        dimensions = ("correctness", "depth", "rigor", "fit")
        db.add(
            InterviewReport(
                id=f"{session_id}_r",
                session_id=session_id,
                rubric_version=rubric,
                content_scores=[
                    {"dimension": dimension, "score": score, "evidence": [f"证据 {dimension}"]}
                    for dimension, score in zip(dimensions, scores, strict=True)
                ],
                summary="总体评价",
                highlights=[],
                gaps=["原理深度不足"],
                suggestions=["补充并发渲染原理", "补一次性能数据"],
                created_at=created_at,
            )
        )
    db.commit()
    return session


def patch_llm(monkeypatch: pytest.MonkeyPatch, *, questions=None, report=None, insights=None):
    calls: list[dict[str, str]] = []
    state = {"round": 0}

    def fake(db, owner_id, *, system_prompt, user_prompt, max_tokens=None, client=None):
        calls.append({"system": system_prompt, "user": user_prompt})
        if "匹配点" in system_prompt:
            return insights if insights is not None else INSIGHTS_PAYLOAD
        if "评估" in system_prompt:
            return report if report is not None else REPORT_PAYLOAD
        state["round"] += 1
        if questions is not None:
            return questions
        return QUESTION_PAYLOAD

    monkeypatch.setattr(interview_llm, "chat_json", fake)
    return calls


def create_session(client, *, role: str = "高级前端工程师") -> dict:
    response = client.post(
        "/interview/sessions",
        json={"resumeVersionId": "ver_test", "jdId": "jd_test", "role": role, "questionCount": 3},
    )
    assert response.status_code == 201, response.text
    return response.json()


def answer_all(client, session: dict) -> None:
    for question in session["questions"]:
        answered = client.post(
            f"/interview/sessions/{session['id']}/answers",
            json={
                "questionId": question["id"],
                "content": f"针对「{question['prompt']}」的回答：我把低优先级更新让出去了。",
                "idempotencyKey": f"k-{question['id']}",
            },
        )
        assert answered.status_code == 200, answered.text


# --------------------------------------------------------------------------- #
# GET /interview/growth
# --------------------------------------------------------------------------- #


def test_growth_aggregates_real_sessions_by_role_and_rubric(client, db_session: Session) -> None:
    base = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    add_completed_session(db_session, "ivs_java_1", role="Java 后端", rubric="interview-rubric-v1", scores=(80, 75, 70, 86), created_at=base)
    add_completed_session(db_session, "ivs_java_2", role="Java 后端", rubric="interview-rubric-v1", scores=(90, 87, 86, 88), created_at=base + timedelta(days=1))
    add_completed_session(db_session, "ivs_java_3", role="Java 后端", rubric="interview-rubric-v1", scores=(90, 88, 87, 90), created_at=base + timedelta(days=2))
    add_completed_session(db_session, "ivs_java_v2", role="Java 后端", rubric="interview-rubric-v2", scores=(50, 50, 50, 50), created_at=base + timedelta(days=3))
    add_completed_session(db_session, "ivs_web_1", role="Web 前端", rubric="interview-rubric-v1", scores=(60, 60, 60, 60), created_at=base + timedelta(days=4))

    response = client.get("/interview/growth", params={"role": "Java 后端"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "Java 后端"
    assert body["totalSessions"] == 4
    # 只有该岗位两条口径；v1 场次多，选为主口径。
    assert [item["rubricVersion"] for item in body["calibers"]] == ["interview-rubric-v1", "interview-rubric-v2"]
    assert body["primaryCaliberKey"] == "Java 后端|interview-rubric-v1"
    assert body["series"][0]["averages"]["overall"] == round((78 + 88 + 89) / 3, 2)
    points = body["series"][0]["points"]
    assert [point["average"] for point in points] == [78, 88, 89]
    assert [point["correctness"] for point in points] == [80, 90, 90]
    assert [point["sessionId"] for point in points] == ["ivs_java_1", "ivs_java_2", "ivs_java_3"]
    assert points[0]["createdAt"].startswith("2026-10-01")

    # 不带 role 时聚合全部岗位的口径。
    everything = client.get("/interview/growth")
    assert everything.status_code == 200
    assert everything.json()["totalSessions"] == 5
    keys = {caliber["key"] for caliber in everything.json()["calibers"]}
    assert "Web 前端|interview-rubric-v1" in keys


def test_growth_skips_sessions_without_report(client, db_session: Session) -> None:
    base = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    add_completed_session(db_session, "ivs_done", role="Java 后端", rubric="interview-rubric-v1", scores=(80, 80, 80, 80), created_at=base)
    add_completed_session(db_session, "ivs_active", role="Java 后端", rubric="interview-rubric-v1", scores=(10, 10, 10, 10), created_at=base, with_report=False)

    body = client.get("/interview/growth", params={"role": "Java 后端"}).json()

    assert body["totalSessions"] == 1
    assert [point["sessionId"] for point in body["series"][0]["points"]] == ["ivs_done"]


def test_growth_empty_role_returns_empty_series(client, db_session: Session) -> None:
    body = client.get("/interview/growth", params={"role": "不存在的岗位"}).json()
    assert body["totalSessions"] == 0
    assert body["series"] == []
    assert body["primaryCaliberKey"] is None


# --------------------------------------------------------------------------- #
# GET /interview/comparison
# --------------------------------------------------------------------------- #


def test_comparison_same_role_and_rubric_is_connectable(client, db_session: Session) -> None:
    base = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    add_completed_session(db_session, "ivs_a", role="Java 后端", rubric="interview-rubric-v1", scores=(80, 75, 70, 86), created_at=base)
    add_completed_session(db_session, "ivs_b", role="Java 后端", rubric="interview-rubric-v1", scores=(90, 87, 86, 88), created_at=base + timedelta(days=1))

    response = client.get("/interview/comparison", params={"a": "ivs_a", "b": "ivs_b"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["connectable"] is True
    assert body["sameRole"] is True
    assert body["sameRubricVersion"] is True
    assert body["reason"] == "SAME_CALIBER"
    assert body["a"]["average"] == 78
    assert body["b"]["average"] == 88
    assert [item["score"] for item in body["a"]["scores"]] == [80, 75, 70, 86]


def test_comparison_different_rubric_version_is_not_connectable(client, db_session: Session) -> None:
    base = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    add_completed_session(db_session, "ivs_a", role="Java 后端", rubric="interview-rubric-v1", scores=(80, 80, 80, 80), created_at=base)
    add_completed_session(db_session, "ivs_b", role="Java 后端", rubric="interview-rubric-v2", scores=(90, 90, 90, 90), created_at=base)

    body = client.get("/interview/comparison", params={"a": "ivs_a", "b": "ivs_b"}).json()

    assert body["connectable"] is False
    assert body["sameRole"] is True
    assert body["sameRubricVersion"] is False
    assert body["reason"] == "RUBRIC_VERSION_MISMATCH"


def test_comparison_different_role_same_rubric_is_not_connectable(client, db_session: Session) -> None:
    base = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    add_completed_session(db_session, "ivs_a", role="Java 后端", rubric="interview-rubric-v1", scores=(80, 80, 80, 80), created_at=base)
    add_completed_session(db_session, "ivs_b", role="Web 前端", rubric="interview-rubric-v1", scores=(90, 90, 90, 90), created_at=base)

    body = client.get("/interview/comparison", params={"a": "ivs_a", "b": "ivs_b"}).json()

    assert body["connectable"] is False
    assert body["sameRole"] is False
    assert body["reason"] == "ROLE_MISMATCH"


def test_comparison_rejects_foreign_session(client, db_session: Session) -> None:
    base = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    add_completed_session(db_session, "ivs_a", role="Java 后端", rubric="interview-rubric-v1", scores=(80, 80, 80, 80), created_at=base)
    add_completed_session(db_session, "ivs_other", role="Java 后端", rubric="interview-rubric-v1", scores=(90, 90, 90, 90), created_at=base, owner_id="user_other")

    response = client.get("/interview/comparison", params={"a": "ivs_a", "b": "ivs_other"})

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


# --------------------------------------------------------------------------- #
# practice items
# --------------------------------------------------------------------------- #


def test_practice_items_materialised_from_report_suggestions(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)
    answer_all(client, session)
    report = client.post(f"/interview/sessions/{session['id']}/finish").json()

    response = client.post("/interview/practice-items", json={"reportId": report["id"]})

    assert response.status_code == 201, response.text
    items = response.json()
    # 只有 correctness 的证据是作答原话、拿到 86 分；其余三维证据被丢弃（score=null）而落成练习项。
    assert {item["dimension"] for item in items} == {"depth", "rigor", "fit"}
    assert all(item["goal"] in REPORT_PAYLOAD["suggestions"] for item in items)
    assert all(item["sourceReportId"] == report["id"] for item in items)
    assert all(item["sourceSessionId"] == session["id"] for item in items)
    assert all(item["status"] == "active" for item in items)
    stored = db_session.query(PracticeItem).all()
    assert len(stored) == len(items)
    # 重复调用幂等：不重复落库。
    again = client.post("/interview/practice-items", json={"reportId": report["id"]})
    assert again.status_code == 201
    assert len(again.json()) == len(items)
    assert db_session.query(PracticeItem).count() == len(items)


def test_practice_items_list_filters_by_role(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client, role="高级前端工程师")
    answer_all(client, session)
    report = client.post(f"/interview/sessions/{session['id']}/finish").json()
    client.post("/interview/practice-items", json={"reportId": report["id"]})

    matching = client.get("/interview/practice-items", params={"role": "高级前端工程师"})
    assert matching.status_code == 200
    assert len(matching.json()) >= 1
    other = client.get("/interview/practice-items", params={"role": "别的岗位"})
    assert other.status_code == 200
    assert other.json() == []


def test_practice_item_retest_starts_a_new_session(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)
    answer_all(client, session)
    report = client.post(f"/interview/sessions/{session['id']}/finish").json()
    item = client.post("/interview/practice-items", json={"reportId": report["id"]}).json()[0]

    response = client.post(f"/interview/practice-items/{item['id']}/retest")

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["item"]["retestSessionId"] == body["session"]["id"]
    assert body["session"]["id"] != session["id"]
    assert body["session"]["status"] == "active"
    assert body["session"]["role"] == session["role"]
    assert body["session"]["rubricVersion"] == session["rubricVersion"]
    assert len(body["session"]["questions"]) >= 3
    # 复测会话同样冻结在源会话的简历版本与 JD 上。
    source = db_session.get(InterviewSession, session["id"])
    retest = db_session.get(InterviewSession, body["session"]["id"])
    assert retest is not None and source is not None
    assert retest.resume_version_id == source.resume_version_id
    assert retest.jd_id == source.jd_id


def test_practice_item_retest_rejects_foreign_item(client, db_session: Session) -> None:
    db_session.add(
        PracticeItem(
            id="pti_other",
            owner_id="user_other",
            role="Java 后端",
            dimension="depth",
            goal="补深度",
            material="",
            status="active",
            source_report_id="ivr_other",
            source_session_id="ivs_other",
            rubric_version="interview-rubric-v1",
            retest_session_id=None,
            created_at=NOW,
            updated_at=NOW,
        )
    )
    db_session.commit()

    response = client.post("/interview/practice-items/pti_other/retest")

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


# --------------------------------------------------------------------------- #
# POST /interview/sessions/{id}/regenerate
# --------------------------------------------------------------------------- #


def test_regenerate_replaces_questions_for_unanswered_session(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    second = {
        "questions": [
            {"kind": "behavioral", "prompt": "新题一？", "referencePoints": ["a"]},
            {"kind": "technical", "prompt": "新题二？", "referencePoints": ["b"]},
            {"kind": "situational", "prompt": "新题三？", "referencePoints": ["c"]},
        ]
    }
    calls: list[dict] = []

    def fake(db, owner_id, *, system_prompt, user_prompt, max_tokens=None, client=None):
        calls.append({"system": system_prompt, "user": user_prompt})
        return QUESTION_PAYLOAD if len(calls) == 1 else second

    monkeypatch.setattr(interview_llm, "chat_json", fake)
    session = create_session(client)
    old_ids = {question["id"] for question in session["questions"]}

    response = client.post(f"/interview/sessions/{session['id']}/regenerate")

    assert response.status_code == 200, response.text
    body = response.json()
    assert [question["prompt"] for question in body["questions"]] == ["新题一？", "新题二？", "新题三？"]
    assert [question["ordinal"] for question in body["questions"]] == [1, 2, 3]
    assert old_ids.isdisjoint({question["id"] for question in body["questions"]})
    assert body["contextSnapshot"]["jdBody"] == "负责 C 端核心页面开发；要求精通 React 与 TypeScript，有性能优化经验。"


def test_regenerate_rejects_answered_session_with_409(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)
    session = create_session(client)
    client.post(
        f"/interview/sessions/{session['id']}/answers",
        json={"questionId": session["questions"][0]["id"], "content": "先答一题：我把低优先级更新让出去了。"},
    )

    response = client.post(f"/interview/sessions/{session['id']}/regenerate")

    assert response.status_code == 409
    assert response.json()["code"] == "RUN_STATE_CONFLICT"
    assert db_session.query(InterviewAnswer).count() == 1


def test_regenerate_rejects_foreign_session(client, db_session: Session) -> None:
    db_session.add(
        InterviewSession(
            id="ivs_other",
            owner_id="user_other",
            resume_id="res_other",
            resume_version_id="ver_other",
            jd_id="jd_other",
            role="Java 后端",
            status="active",
            rubric_version="interview-rubric-v1",
            context_snapshot={},
            created_at=NOW,
            updated_at=NOW,
            completed_at=None,
        )
    )
    db_session.commit()

    response = client.post("/interview/sessions/ivs_other/regenerate")

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


# --------------------------------------------------------------------------- #
# GET /interview/insights
# --------------------------------------------------------------------------- #


def test_insights_returns_match_risk_scope_from_real_content(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    calls = patch_llm(monkeypatch)

    response = client.get("/interview/insights", params={"resumeVersionId": "ver_test", "jdId": "jd_test"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["resumeVersionId"] == "ver_test"
    assert body["jdId"] == "jd_test"
    assert body["matchPoints"] == INSIGHTS_PAYLOAD["matchPoints"]
    assert body["riskPoints"] == INSIGHTS_PAYLOAD["riskPoints"]
    assert body["scopeKeywords"] == INSIGHTS_PAYLOAD["scopeKeywords"]
    # 提示词必须带真实简历与 JD 正文，而不是岗位标签。
    prompt = calls[-1]["user"]
    assert "负责 C 端核心页面开发" in prompt
    assert "高级前端工程师" in prompt
    assert "React" in prompt


def test_insights_without_model_config_returns_model_not_configured(client, db_session: Session) -> None:
    seed_context(db_session)

    response = client.get("/interview/insights", params={"resumeVersionId": "ver_test", "jdId": "jd_test"})

    assert response.status_code == 409
    assert response.json()["code"] == "MODEL_NOT_CONFIGURED"


def test_insights_invalid_model_output_returns_model_output_invalid(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch, insights={"matchPoints": [], "riskPoints": [], "scopeKeywords": []})

    response = client.get("/interview/insights", params={"resumeVersionId": "ver_test", "jdId": "jd_test"})

    assert response.status_code == 502
    assert response.json()["code"] == "MODEL_OUTPUT_INVALID"
    assert "Traceback" not in response.json()["message"]


def test_insights_rejects_foreign_resume_version(client, db_session: Session, monkeypatch) -> None:
    seed_context(db_session)
    patch_llm(monkeypatch)

    response = client.get("/interview/insights", params={"resumeVersionId": "ver_missing", "jdId": "jd_test"})

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"
