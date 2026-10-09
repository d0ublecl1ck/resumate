"""笔试模块：客观题确定性判分、开放题模型评分、代码题只评审不执行。

模型侧一律 monkeypatch app.modules.interview.llm.chat_json，测试不访问外网；
代码题用「真实文件系统哨兵」证明提交的代码没有被执行。
"""

from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from app.modules.bank.models import BankQuestion
from app.modules.interview import llm as interview_llm
from app.modules.quiz import seed as quiz_seed
from app.modules.quiz import service as quiz_service
from app.modules.quiz.models import QuizAnswer, QuizAttempt

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
OWNER = "user_test"

OPEN_ANSWER = "我用网关限流先保护数据库，再看慢查询与连接池监控，最后按优先级降级非核心链路。"
CODE_ANSWER = (
    "export function limit(bucket, now, windowMs, threshold) {\n"
    "  if (now - bucket.windowStart >= windowMs) {\n"
    "    bucket.windowStart = now\n"
    "    bucket.used = 0\n"
    "  }\n"
    "  if (bucket.used >= threshold) return false\n"
    "  bucket.used += 1\n"
    "  return true\n"
    "}"
)

OPEN_PAYLOAD = {
    "dimensions": [
        {"dimension": "correctness", "score": 80, "evidence": ["我用网关限流先保护数据库"]},
        {"dimension": "depth", "score": 60, "evidence": ["慢查询与连接池监控"]},
        {"dimension": "rigor", "score": 40, "evidence": []},
    ],
    "summary": "排查顺序清楚，但取舍说明偏薄。",
    "highlights": ["先保护数据库"],
    "gaps": ["缺少指标口径"],
    "suggestions": ["补充 P99 与连接数指标"],
}

CODE_PAYLOAD = {
    "dimensions": [
        {"dimension": "correctness", "score": 70, "evidence": ["if (bucket.used >= threshold) return false"]},
        {"dimension": "readability", "score": 90, "evidence": ["export function limit"]},
    ],
    "summary": "核心逻辑正确，窗口重置已处理。",
    "issues": ["没有处理并发写入"],
    "suggestions": ["补充并发说明"],
}


def patch_llm(
    monkeypatch: pytest.MonkeyPatch,
    *,
    open_payload: dict | None = None,
    code_payload: dict | None = None,
) -> list[str]:
    """按 system prompt 分派开放题 / 代码题评审；返回收到的 system prompt。"""
    calls: list[str] = []

    def fake(db, owner_id, *, system_prompt, user_prompt, max_tokens=None, client=None):
        calls.append(system_prompt)
        if "代码评审" in system_prompt:
            return code_payload if code_payload is not None else CODE_PAYLOAD
        return open_payload if open_payload is not None else OPEN_PAYLOAD

    monkeypatch.setattr(interview_llm, "chat_json", fake)
    return calls


def seed_bank_question(db: Session, *, role: str = "Java 后端") -> BankQuestion:
    row = BankQuestion(
        id="bkq_quiz_1",
        role=role,
        kind="scenario",
        difficulty="medium",
        prompt="线上接口 P99 突然翻倍，你会按什么顺序排查？",
        reference_points=["先看监控定位", "再决定是否回滚"],
        knowledge_refs=["可观测性 · 排查顺序"],
        source="seed_model",
        batch_id="batch_quiz",
        prompt_hash="hash_quiz_1",
        created_at=NOW,
        updated_at=NOW,
    )
    db.add(row)
    db.commit()
    return row


def create_attempt(client, *, role: str = "Java 后端", types: list[str] | None = None):
    payload: dict = {"role": role}
    if types is not None:
        payload["questionTypes"] = types
    response = client.post("/quiz/attempts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def pick(body: dict, group: str) -> dict:
    for question in body["questions"]:
        if question["group"] == group:
            return question
    raise AssertionError("缺少题型分组 " + group)


# ---------------------------------------------------------------------------
# 抽题：按 role + 题型，客观题答案键不下发
# ---------------------------------------------------------------------------


def test_create_attempt_draws_questions_and_hides_answer_key(client, db_session: Session) -> None:
    seed_bank_question(db_session)

    body = create_attempt(client)

    assert body["status"] == "in_progress"
    assert body["result"] is None
    assert [question["group"] for question in body["questions"]] == ["objective", "open", "code"]
    assert body["maxScore"] == sum(question["points"] for question in body["questions"])

    objective = pick(body, "objective")
    assert objective["kind"] in {"single_choice", "multiple_choice", "true_false"}
    assert len(objective["options"]) >= 2
    # 正确答案键可以落库，但绝不出现在任何下发给前端的字段里。
    serialized = str(body)
    assert "correctOptionIds" not in serialized
    assert "correct_option_ids" not in serialized

    open_question = pick(body, "open")
    assert open_question["source"]["kind"] == "bank"
    assert open_question["prompt"] == "线上接口 P99 突然翻倍，你会按什么顺序排查？"
    assert open_question["referencePoints"] == ["先看监控定位", "再决定是否回滚"]

    code_question = pick(body, "code")
    assert code_question["source"]["kind"] == "seed"

    stored = db_session.get(QuizAttempt, body["id"])
    assert stored is not None
    assert stored.questions_snapshot[0]["correctOptionIds"]


def test_open_question_falls_back_to_seed_when_bank_empty(client, db_session: Session) -> None:
    body = create_attempt(client, role="完全未知岗位")
    assert pick(body, "open")["source"]["kind"] == "seed"


def test_create_attempt_rejects_empty_role(client) -> None:
    response = client.post("/quiz/attempts", json={"role": "   "})
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


# ---------------------------------------------------------------------------
# 客观题判分口径：全对满分；无错选的子集半对；有错选或空选 0 分
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("kind", "selected", "correct", "points", "expected", "verdict"),
    [
        ("single_choice", ["b"], ["b"], 10, 10, "correct"),
        ("single_choice", ["a"], ["b"], 10, 0, "incorrect"),
        ("true_false", ["true"], ["true"], 10, 10, "correct"),
        ("multiple_choice", ["a", "c", "d"], ["a", "c", "d"], 10, 10, "correct"),
        ("multiple_choice", ["a", "c"], ["a", "c", "d"], 10, 5, "partial"),
        ("multiple_choice", ["a"], ["a", "c", "d"], 10, 5, "partial"),
        ("multiple_choice", ["a", "b"], ["a", "c", "d"], 10, 0, "incorrect"),
        ("multiple_choice", [], ["a", "c", "d"], 10, 0, "incorrect"),
        ("multiple_choice", ["a", "c", "d", "b"], ["a", "c", "d"], 10, 0, "incorrect"),
    ],
)
def test_objective_scoring_policy(kind, selected, correct, points, expected, verdict) -> None:
    result = quiz_service.grade_objective(kind, selected=selected, correct=correct, points=points)
    assert result["awardedPoints"] == expected
    assert result["verdict"] == verdict


def test_submit_objective_answer_returns_graded_result_and_analysis(client, db_session: Session) -> None:
    body = create_attempt(client, role="完全未知岗位", types=["objective"])
    question = pick(body, "objective")
    correct = list(quiz_seed.seed_question("objective")["correctOptionIds"])

    response = client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": question["id"], "selectedOptionIds": correct, "idempotencyKey": "k1"},
    )

    assert response.status_code == 200, response.text
    answer = response.json()["answer"]
    assert answer["awardedPoints"] == question["points"]
    assert answer["verdict"] == "correct"
    assert answer["executed"] is None
    assert {item["optionId"] for item in answer["feedback"]["optionAnalysis"]} == {
        option["id"] for option in question["options"]
    }


# ---------------------------------------------------------------------------
# 幂等与提交
# ---------------------------------------------------------------------------


def test_repeated_answer_submission_is_idempotent(client, db_session: Session) -> None:
    body = create_attempt(client, role="完全未知岗位", types=["objective"])
    question = pick(body, "objective")
    payload = {
        "questionId": question["id"],
        "selectedOptionIds": [question["options"][0]["id"]],
        "idempotencyKey": "same-key",
    }

    first = client.post(f"/quiz/attempts/{body['id']}/answers", json=payload)
    second = client.post(f"/quiz/attempts/{body['id']}/answers", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["answer"]["id"] == second.json()["answer"]["id"]
    assert db_session.query(QuizAnswer).filter_by(attempt_id=body["id"]).count() == 1


def test_get_attempt_before_submit_has_no_final_result(client, db_session: Session) -> None:
    body = create_attempt(client, role="完全未知岗位", types=["objective"])
    question = pick(body, "objective")

    detail = client.get(f"/quiz/attempts/{body['id']}")
    assert detail.status_code == 200
    initial = detail.json()
    assert initial["status"] == "in_progress"
    assert initial["result"] is None
    assert initial["answers"] == []

    client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": question["id"], "selectedOptionIds": [question["options"][0]["id"]]},
    )
    partial = client.get(f"/quiz/attempts/{body['id']}").json()
    assert partial["status"] == "in_progress"
    assert partial["result"] is None
    assert len(partial["answers"]) == 1


def test_submit_attempt_is_idempotent_and_aggregates_scores(client, db_session: Session) -> None:
    body = create_attempt(client, role="完全未知岗位", types=["objective"])
    question = pick(body, "objective")
    correct = list(quiz_seed.seed_question("objective")["correctOptionIds"])
    client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": question["id"], "selectedOptionIds": correct},
    )

    first = client.post(f"/quiz/attempts/{body['id']}/submit")
    assert first.status_code == 200, first.text
    result = first.json()
    assert result["status"] == "submitted"
    assert result["result"]["totalScore"] == question["points"]
    assert result["result"]["maxScore"] == question["points"]
    assert result["result"]["submittedAt"]

    second = client.post(f"/quiz/attempts/{body['id']}/submit")
    assert second.status_code == 200
    assert second.json()["result"]["totalScore"] == result["result"]["totalScore"]
    assert second.json()["result"]["submittedAt"] == result["result"]["submittedAt"]


def test_answer_after_submit_is_rejected(client, db_session: Session) -> None:
    body = create_attempt(client, role="完全未知岗位", types=["objective"])
    question = pick(body, "objective")
    client.post(f"/quiz/attempts/{body['id']}/submit")
    response = client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": question["id"], "selectedOptionIds": [question["options"][0]["id"]]},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "RUN_STATE_CONFLICT"


def test_unknown_attempt_and_question_return_404(client, db_session: Session) -> None:
    assert client.get("/quiz/attempts/qza_missing").status_code == 404
    body = create_attempt(client, role="完全未知岗位", types=["objective"])
    response = client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": "qzq_missing", "selectedOptionIds": ["a"]},
    )
    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


# ---------------------------------------------------------------------------
# 开放题：模型评分 + 原话证据
# ---------------------------------------------------------------------------


def test_open_answer_grades_with_verbatim_evidence(client, db_session: Session, monkeypatch) -> None:
    patch_llm(monkeypatch)
    body = create_attempt(client, role="完全未知岗位", types=["open"])
    question = pick(body, "open")

    response = client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": question["id"], "textAnswer": OPEN_ANSWER},
    )

    assert response.status_code == 200, response.text
    answer = response.json()["answer"]
    assert answer["awardedPoints"] is not None
    assert 0 <= answer["awardedPoints"] <= question["points"]
    assert answer["verdict"] == "graded"
    dimensions = {item["dimension"]: item for item in answer["feedback"]["dimensions"]}
    assert dimensions["correctness"]["evidence"] == ["我用网关限流先保护数据库"]
    # 无原话证据的维度不给分，而不是给 0 分。
    assert dimensions["rigor"]["score"] is None
    assert dimensions["rigor"]["evidence"] == []
    assert answer["feedback"]["summary"] == OPEN_PAYLOAD["summary"]


def test_open_answer_drops_non_verbatim_evidence(client, db_session: Session, monkeypatch) -> None:
    patch_llm(
        monkeypatch,
        open_payload={
            "dimensions": [
                {"dimension": "correctness", "score": 90, "evidence": ["这句话根本没有出现在作答里"]},
                {"dimension": "depth", "score": 50, "evidence": ["慢查询与连接池监控"]},
            ],
            "summary": "s",
            "highlights": [],
            "gaps": [],
            "suggestions": [],
        },
    )
    body = create_attempt(client, role="完全未知岗位", types=["open"])
    question = pick(body, "open")

    response = client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": question["id"], "textAnswer": OPEN_ANSWER},
    )

    assert response.status_code == 200, response.text
    dimensions = {item["dimension"]: item for item in response.json()["answer"]["feedback"]["dimensions"]}
    assert dimensions["correctness"]["evidence"] == []
    assert dimensions["correctness"]["score"] is None
    assert dimensions["depth"]["evidence"] == ["慢查询与连接池监控"]


def test_open_answer_without_any_evidence_returns_model_output_invalid(
    client, db_session: Session, monkeypatch
) -> None:
    patch_llm(
        monkeypatch,
        open_payload={
            "dimensions": [
                {"dimension": "correctness", "score": 90, "evidence": ["完全无关的引用"]},
            ],
            "summary": "s",
            "highlights": [],
            "gaps": [],
            "suggestions": [],
        },
    )
    body = create_attempt(client, role="完全未知岗位", types=["open"])
    question = pick(body, "open")

    response = client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": question["id"], "textAnswer": OPEN_ANSWER},
    )

    assert response.status_code == 502
    assert response.json()["code"] == "MODEL_OUTPUT_INVALID"
    assert db_session.query(QuizAnswer).filter_by(attempt_id=body["id"]).count() == 0


def test_open_answer_without_model_config_returns_stable_error(client, db_session: Session) -> None:
    body = create_attempt(client, role="完全未知岗位", types=["open"])
    question = pick(body, "open")

    response = client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": question["id"], "textAnswer": OPEN_ANSWER},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "MODEL_NOT_CONFIGURED"
    assert "Traceback" not in response.json()["message"]
    assert db_session.query(QuizAnswer).filter_by(attempt_id=body["id"]).count() == 0


# ---------------------------------------------------------------------------
# 代码题：只评审，不执行
# ---------------------------------------------------------------------------


def test_code_answer_reviews_without_executing(client, db_session: Session, monkeypatch, tmp_path) -> None:
    sentinel = tmp_path / "quiz-code-executed"
    patch_llm(
        monkeypatch,
        code_payload={
            "dimensions": [
                {"dimension": "correctness", "score": 70, "evidence": ["os.system"]},
                {"dimension": "readability", "score": 80, "evidence": ["export function limit"]},
            ],
            "summary": "评审通过，未执行。",
            "issues": ["存在危险调用"],
            "suggestions": ["移除危险调用"],
        },
    )
    body = create_attempt(client, role="完全未知岗位", types=["code"])
    question = pick(body, "code")
    dangerous = CODE_ANSWER + '\nos.system("touch ' + str(sentinel) + '")'

    response = client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": question["id"], "codeAnswer": dangerous},
    )

    assert response.status_code == 200, response.text
    answer = response.json()["answer"]
    assert answer["executed"] is False
    assert answer["feedback"]["executed"] is False
    assert {item["dimension"] for item in answer["feedback"]["dimensions"]} == {"correctness", "readability"}
    assert not sentinel.exists()


def test_code_answer_rejects_empty_payload(client, db_session: Session) -> None:
    body = create_attempt(client, role="完全未知岗位", types=["code"])
    question = pick(body, "code")
    response = client.post(
        f"/quiz/attempts/{body['id']}/answers",
        json={"questionId": question["id"], "codeAnswer": "   "},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_submit_attempt_with_open_and_code_answers(client, db_session: Session, monkeypatch) -> None:
    patch_llm(monkeypatch)
    body = create_attempt(client, role="完全未知岗位")
    for group, payload in (
        ("objective", {"selectedOptionIds": list(quiz_seed.seed_question("objective")["correctOptionIds"])}),
        ("open", {"textAnswer": OPEN_ANSWER}),
        ("code", {"codeAnswer": CODE_ANSWER}),
    ):
        question = pick(body, group)
        response = client.post(
            f"/quiz/attempts/{body['id']}/answers",
            json={"questionId": question["id"], **payload},
        )
        assert response.status_code == 200, response.text

    submitted = client.post(f"/quiz/attempts/{body['id']}/submit")
    assert submitted.status_code == 200, submitted.text
    result = submitted.json()["result"]
    assert result["totalScore"] == sum(item["awardedPoints"] or 0 for item in submitted.json()["answers"])
    assert result["totalScore"] > 0