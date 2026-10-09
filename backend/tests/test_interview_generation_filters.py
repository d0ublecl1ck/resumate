"""面试出题补全：四类题型、难度/题型筛选与知识库依据注入（US-14.1 / US-14.2）。

- 真实 HTTP：起本地 OpenAI 兼容假服务，跑通 httpx -> socket -> 解析 -> 落库 -> 响应；
- 知识库检索走真实的确定性 BM25（不 monkeypatch），引用可与 GET /kb/search 对账；
- 无知识库命中时断言不伪造引用。
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.modules.interview import service as interview_service
from app.modules.interview.models import InterviewQuestion, InterviewSession
from app.modules.jd.models import JobDescription
from app.modules.resume.models import Resume, ResumeVersion
from app.modules.settings import service as settings_service
from app.modules.settings.schemas import ModelConfigUpdate
from app.shared.errors import ModelOutputInvalid

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
OWNER = "user_test"
USER = CurrentUser(id=OWNER, display_name="测试用户", role="super_admin", roles=("super_admin",))
JAVA = "Java 后端"
SPRING_DOC = """# Spring 事务管理

## 失效场景

自调用不经过代理、异常被 catch 吞掉、方法不是 public 时会失效。
"""

FOUR_KINDS = {
    "questions": [
        {"kind": "technical", "prompt": "Spring 事务在哪些情况下会失效？", "referencePoints": ["自调用", "异常吞掉"]},
        {"kind": "deep_dive", "prompt": "讲讲你主导的订单中台分库分表改造。", "referencePoints": ["背景", "取舍"]},
        {"kind": "scenario", "prompt": "大促流量翻十倍时如何保护数据库？", "referencePoints": ["限流", "降级"]},
        {"kind": "behavioral", "prompt": "讲一次你推动跨团队改进的经历。", "referencePoints": ["角色", "结果"]},
    ]
}
LEGACY_THREE = {
    "questions": [
        {"kind": "technical", "prompt": "题一", "referencePoints": ["要点"]},
        {"kind": "behavioral", "prompt": "题二", "referencePoints": ["要点"]},
        {"kind": "situational", "prompt": "题三", "referencePoints": ["要点"]},
    ]
}
SCENARIO_ONLY = {
    "questions": [
        {"kind": "scenario", "prompt": "线上流量突增如何保护下游？", "referencePoints": ["限流"]},
        {"kind": "scenario", "prompt": "数据库连接池打满如何处置？", "referencePoints": ["排查"]},
        {"kind": "scenario", "prompt": "缓存雪崩时如何处理？", "referencePoints": ["降级"]},
    ]
}
SITUATIONAL_THREE = {
    "questions": [
        {"kind": "situational", "prompt": "题一", "referencePoints": ["要点"]},
        {"kind": "situational", "prompt": "题二", "referencePoints": ["要点"]},
        {"kind": "situational", "prompt": "题三", "referencePoints": ["要点"]},
    ]
}


class _Model:
    """按顺序返回题目 payload 的本地假模型；记录收到的 user prompt 供断言。"""

    def __init__(self, payloads: list[dict]) -> None:
        self.payloads = payloads
        self.seen: list[str] = []
        self.index = 0
        self.endpoint = ""

    def handler(self) -> type[BaseHTTPRequestHandler]:
        model = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
                length = int(self.headers.get("content-length", "0"))
                body = json.loads(self.rfile.read(length) or b"{}")
                system = body["messages"][0]["content"]
                model.seen.append(body["messages"][1]["content"])
                if "评估" in system or "追问" in system:
                    payload = {"contentScores": [], "summary": "", "highlights": [], "gaps": [], "suggestions": []}
                else:
                    payload = model.payloads[min(model.index, len(model.payloads) - 1)]
                    model.index += 1
                data = json.dumps(
                    {"choices": [{"message": {"content": json.dumps(payload, ensure_ascii=False)}}]},
                    ensure_ascii=False,
                ).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *args) -> None:  # 静默，避免污染测试输出
                return

        return Handler


@pytest.fixture
def model_server():
    started: list[tuple[HTTPServer, threading.Thread]] = []

    def start(payloads: list[dict]) -> _Model:
        model = _Model(payloads)
        server = HTTPServer(("127.0.0.1", 0), model.handler())
        model.endpoint = f"http://127.0.0.1:{server.server_address[1]}/v1"
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        started.append((server, thread))
        return model

    yield start

    for server, thread in started:
        server.shutdown()
        thread.join(timeout=5)


def seed_context(db: Session) -> None:
    db.add(
        Resume(
            id="res_test",
            owner_id=OWNER,
            profile_id=None,
            title="后端工程师简历",
            target_role=JAVA,
            tags=["后端"],
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
            snapshot={"basics": {"name": "示例同学"}, "skills": ["Spring", "MySQL"]},
            started_at=NOW,
            committed_at=NOW,
        )
    )
    db.add(
        JobDescription(
            id="jd_test",
            owner_id=OWNER,
            role=JAVA,
            company="某科技",
            body="负责 Spring 事务与分布式一致性；要求熟悉 MySQL 与 Redis。",
            source_url=None,
            tags=["后端"],
            revision=1,
            bound_resume_id=None,
            created_at=NOW,
            updated_at=NOW,
        )
    )
    db.commit()


def configure_model(db: Session, model: _Model) -> None:
    settings_service.update_model_config(
        db,
        USER,
        ModelConfigUpdate(provider="openai", endpoint=model.endpoint, model="fake-model", api_key="sk-fake"),
    )


def create_session(client, **overrides) -> dict:
    payload = {"resumeVersionId": "ver_test", "jdId": "jd_test", "role": JAVA, "questionCount": 4}
    payload.update(overrides)
    response = client.post("/interview/sessions", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------- #
# 四类题型与难度
# --------------------------------------------------------------------------- #


def test_create_session_generates_four_kinds_with_difficulty(client, db_session: Session, model_server) -> None:
    seed_context(db_session)
    model = model_server([FOUR_KINDS])
    configure_model(db_session, model)

    body = create_session(
        client,
        kinds=["technical", "deep_dive", "scenario", "behavioral"],
        difficulty="hard",
    )

    kinds = [question["kind"] for question in body["questions"]]
    assert set(kinds) == {"technical", "deep_dive", "scenario", "behavioral"}
    assert all(question["difficulty"] == "hard" for question in body["questions"])
    assert body["filters"] == {
        "difficulty": "hard",
        "kinds": ["technical", "deep_dive", "scenario", "behavioral"],
    }
    # 出题 prompt 里明确要求了四类与难度。
    prompt = model.seen[0]
    assert "题型要求" in prompt and "deep_dive" in prompt and "scenario" in prompt
    assert "难度要求：hard" in prompt


def test_create_session_without_filters_keeps_legacy_behaviour(client, db_session: Session, model_server) -> None:
    seed_context(db_session)
    model = model_server([LEGACY_THREE])
    configure_model(db_session, model)

    body = create_session(client)

    assert body["filters"] is None
    assert [question["kind"] for question in body["questions"]] == ["technical", "behavioral", "situational"]
    assert [question["difficulty"] for question in body["questions"]] == [None, None, None]
    assert all(question["knowledgeRefs"] == [] for question in body["questions"])


def test_create_session_normalises_legacy_situational_filter(client, db_session: Session, model_server) -> None:
    seed_context(db_session)
    model = model_server([SITUATIONAL_THREE])
    configure_model(db_session, model)

    body = create_session(client, kinds=["situational"])

    assert body["filters"]["kinds"] == ["scenario"]
    assert [question["kind"] for question in body["questions"]] == ["situational", "situational", "situational"]


def test_create_session_rejects_unknown_difficulty_and_kind(client, db_session: Session) -> None:
    seed_context(db_session)

    bad_difficulty = client.post(
        "/interview/sessions",
        json={"resumeVersionId": "ver_test", "jdId": "jd_test", "role": JAVA, "difficulty": "impossible"},
    )
    bad_kind = client.post(
        "/interview/sessions",
        json={"resumeVersionId": "ver_test", "jdId": "jd_test", "role": JAVA, "kinds": ["unknown"]},
    )

    assert bad_difficulty.status_code == 422, bad_difficulty.text
    assert bad_kind.status_code == 422, bad_kind.text


# --------------------------------------------------------------------------- #
# 重新生成：筛选保留与 409 语义
# --------------------------------------------------------------------------- #


def test_regenerate_applies_filters_and_preserves_them(client, db_session: Session, model_server) -> None:
    seed_context(db_session)
    model = model_server([LEGACY_THREE, SCENARIO_ONLY])
    configure_model(db_session, model)
    created = create_session(client)
    old_ids = {question["id"] for question in created["questions"]}

    response = client.post(
        f"/interview/sessions/{created['id']}/regenerate",
        json={"kinds": ["scenario"], "difficulty": "easy"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert [question["kind"] for question in body["questions"]] == ["scenario", "scenario", "scenario"]
    assert all(question["difficulty"] == "easy" for question in body["questions"])
    assert body["filters"] == {"difficulty": "easy", "kinds": ["scenario"]}
    assert old_ids.isdisjoint({question["id"] for question in body["questions"]})

    # 再次 regenerate 不传参数：沿用已冻结筛选。
    again = client.post(f"/interview/sessions/{created['id']}/regenerate")
    assert again.status_code == 200, again.text
    assert again.json()["filters"] == {"difficulty": "easy", "kinds": ["scenario"]}


def test_regenerate_answered_session_returns_409_and_keeps_snapshot(client, db_session: Session, model_server) -> None:
    seed_context(db_session)
    model = model_server([FOUR_KINDS])
    configure_model(db_session, model)
    created = create_session(client, kinds=["technical", "deep_dive", "scenario", "behavioral"], difficulty="hard")
    before = [(q["id"], q["prompt"]) for q in created["questions"]]
    client.post(
        f"/interview/sessions/{created['id']}/answers",
        json={"questionId": created["questions"][0]["id"], "content": "先答一题。"},
    )

    response = client.post(f"/interview/sessions/{created['id']}/regenerate")

    assert response.status_code == 409
    assert response.json()["code"] == "RUN_STATE_CONFLICT"
    rows = db_session.query(InterviewQuestion).filter_by(session_id=created["id"]).all()
    # 追问会追加一道，但原主问题快照必须原样保留。
    kept = [(row.id, row.prompt) for row in rows if row.kind != "follow_up"]
    assert kept == before


def test_regenerate_completed_session_returns_409(client, db_session: Session, model_server) -> None:
    seed_context(db_session)
    model = model_server([LEGACY_THREE])
    configure_model(db_session, model)
    created = create_session(client)
    row = db_session.get(InterviewSession, created["id"])
    assert row is not None
    row.status = "completed"
    db_session.commit()

    response = client.post(f"/interview/sessions/{created['id']}/regenerate")

    assert response.status_code == 409
    assert response.json()["code"] == "RUN_STATE_CONFLICT"


# --------------------------------------------------------------------------- #
# 知识库依据：命中可对账，未命中不伪造
# --------------------------------------------------------------------------- #


def test_question_knowledge_refs_reconcile_with_real_kb_search(client, db_session: Session, model_server) -> None:
    seed_context(db_session)
    imported = client.post(
        "/kb/documents",
        json={"title": "Spring 事务管理", "role": JAVA, "sourceType": "markdown", "body": SPRING_DOC},
    )
    assert imported.status_code == 201, imported.text
    model = model_server([FOUR_KINDS])
    configure_model(db_session, model)

    body = create_session(client, kinds=["technical", "deep_dive", "scenario", "behavioral"], difficulty="hard")

    # 题干命中知识库切片，题目记录出处。
    technical = next(question for question in body["questions"] if question["kind"] == "technical")
    assert technical["knowledgeRefs"] == ["Spring 事务管理 · 失效场景"]

    # 与真实检索接口对账：同一题干、同一岗位返回同一出处。
    search = client.get("/kb/search", params={"q": technical["prompt"], "role": JAVA})
    assert search.status_code == 200, search.text
    hits = search.json()
    assert hits["status"] == "matched"
    assert [hit["source"] for hit in hits["results"]] == technical["knowledgeRefs"]

    # 知识依据确实被注入出题 prompt。
    assert "知识依据" in model.seen[0] and "Spring 事务管理 · 失效场景" in model.seen[0]


def test_question_without_kb_match_does_not_fabricate_refs(client, db_session: Session, model_server) -> None:
    seed_context(db_session)
    model = model_server([FOUR_KINDS])
    configure_model(db_session, model)

    body = create_session(
        client,
        role="机器学习工程师",
        kinds=["technical", "deep_dive", "scenario", "behavioral"],
        difficulty="medium",
    )

    assert all(question["knowledgeRefs"] == [] for question in body["questions"])
    assert "没有检索到匹配材料" in model.seen[0]


# --------------------------------------------------------------------------- #
# 出题单元：题型筛选与历史别名（不访问外网）
# --------------------------------------------------------------------------- #


def test_generate_questions_rejects_when_filtered_kinds_below_minimum(db_session: Session, monkeypatch) -> None:
    monkeypatch.setattr(
        interview_service.llm,
        "chat_json",
        lambda *a, **k: {
            "questions": [
                {"kind": "technical", "prompt": "题一", "referencePoints": ["要点"]},
                {"kind": "behavioral", "prompt": "题二", "referencePoints": ["要点"]},
                {"kind": "scenario", "prompt": "题三", "referencePoints": ["要点"]},
            ]
        },
    )
    with pytest.raises(ModelOutputInvalid):
        interview_service._generate_questions(
            db_session, OWNER, role=JAVA, jd_body="JD", resume_text="简历", count=3, kinds=["technical", "deep_dive"]
        )


def test_generate_questions_accepts_legacy_situational_for_scenario_filter(db_session: Session, monkeypatch) -> None:
    monkeypatch.setattr(
        interview_service.llm,
        "chat_json",
        lambda *a, **k: {
            "questions": [
                {"kind": "situational", "prompt": "题一", "referencePoints": ["要点"]},
                {"kind": "situational", "prompt": "题二", "referencePoints": ["要点"]},
                {"kind": "situational", "prompt": "题三", "referencePoints": ["要点"]},
            ]
        },
    )
    items = interview_service._generate_questions(
        db_session, OWNER, role=JAVA, jd_body="JD", resume_text="简历", count=3, kinds=["scenario"]
    )
    assert [item["kind"] for item in items] == ["situational", "situational", "situational"]
