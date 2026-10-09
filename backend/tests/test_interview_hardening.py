"""面试模型输出的加固契约：结构化输出、截断重试、原话证据核对、题型白名单。

全部用 httpx.MockTransport 兜住，不访问外网。
"""

import json

import httpx
import pytest
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.modules.interview import llm as interview_llm
from app.modules.interview import service as interview_service
from app.modules.settings import service as settings_service
from app.modules.settings.schemas import ModelConfigUpdate
from app.shared.errors import ModelOutputInvalid

USER = CurrentUser(
    id="user_hardening",
    display_name="测试用户",
    role="super_admin",
    roles=("super_admin",),
    permissions=frozenset(),
)


@pytest.fixture(autouse=True)
def _reset_json_mode() -> object:
    """json_object 能力是进程级记忆，测试之间必须复位。"""
    interview_llm._json_mode_state["supported"] = True
    yield
    interview_llm._json_mode_state["supported"] = True


def configure_model(db: Session) -> None:
    settings_service.update_model_config(
        db,
        USER,
        ModelConfigUpdate(
            provider="openai",
            endpoint="http://example.test/v1",
            model="gpt-4o",
            api_key="sk-test",
        ),
    )


def ok(content: str, finish: str = "stop") -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": content}, "finish_reason": finish}]},
    )


def test_chat_json_requests_json_object_response_format(db_session: Session) -> None:
    configure_model(db_session)
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content.decode("utf-8"))
        return ok('{"ok": true}')

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert interview_llm.chat_json(db_session, USER.id, system_prompt="s", user_prompt="u", client=client) == {"ok": True}

    body = seen["body"]
    assert isinstance(body, dict)
    assert body["response_format"] == {"type": "json_object"}


def test_chat_json_degrades_when_gateway_rejects_response_format(db_session: Session) -> None:
    configure_model(db_session)
    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        calls.append(body)
        if "response_format" in body:
            return httpx.Response(400, json={"error": {"message": "unknown parameter: response_format"}})
        return ok('{"ok": true}')

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        data = interview_llm.chat_json(db_session, USER.id, system_prompt="s", user_prompt="u", client=client)

    assert data == {"ok": True}
    assert len(calls) == 2
    assert "response_format" in calls[0]
    assert "response_format" not in calls[1]
    # 结论被记住：后续请求直接不再带该参数
    assert interview_llm._json_mode_enabled() is False


def test_chat_json_retries_with_doubled_budget_when_output_truncated(db_session: Session) -> None:
    configure_model(db_session)
    budgets: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        budgets.append(body["max_tokens"])
        if len(budgets) == 1:
            return ok('{"questions": [{"prompt": "半截', finish="length")
        return ok('{"questions": [{"kind": "technical", "prompt": "完整题目", "referencePoints": ["要点"]}]}')

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        data = interview_llm.chat_json(
            db_session, USER.id, system_prompt="s", user_prompt="u", max_tokens=1000, client=client
        )

    assert budgets == [1000, 2000]
    assert data["questions"][0]["prompt"] == "完整题目"


def test_chat_json_fails_after_second_unparseable_output(db_session: Session) -> None:
    configure_model(db_session)
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        calls.append(body["max_tokens"])
        return ok("这不是 JSON")

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ModelOutputInvalid):
            interview_llm.chat_json(
                db_session, USER.id, system_prompt="s", user_prompt="u", max_tokens=1000, client=client
            )

    assert len(calls) == 2


def test_coerce_scores_keeps_only_verbatim_evidence() -> None:
    answers = ["我们按订单号做基因法分片，取订单号后四位与用户 ID 哈希拼成分片键。"]
    raw = [
        {"dimension": "correctness", "score": 90, "evidence": ["我们按订单号做基因法分片，取订单号后四位与用户 ID 哈希拼成分片键。"]},
        {"dimension": "depth", "score": 80, "evidence": ["候选人对分片键的设计讲得非常透彻。"]},
    ]

    scores = interview_service._coerce_scores(raw, answers)
    by_dim = {item.dimension: item for item in scores}

    assert by_dim["correctness"].score == 90
    assert by_dim["correctness"].evidence == answers
    # 非原话（模型自己的转述）不能作为证据，该维度因此不给分
    assert by_dim["depth"].score is None
    assert by_dim["depth"].evidence == []


def test_coerce_scores_tolerates_whitespace_and_prefix_quotes() -> None:
    answers = ["限流用令牌桶做单机限流，集群维度用 Redis 滑动窗口，按接口和租户两个维度控制。"]
    raw = [
        {"dimension": "correctness", "score": 70, "evidence": ["限流用 令牌桶 做单机限流，集群维度用 Redis 滑动窗口，按接口和租户两个维度控制。"]},
        {"dimension": "fit", "score": 60, "evidence": ["限流用令牌桶做单机限流，集群维度用"]},
    ]

    by_dim = {item.dimension: item for item in interview_service._coerce_scores(raw, answers)}
    assert by_dim["correctness"].score == 70
    assert by_dim["fit"].score == 60


def test_coerce_scores_raises_when_no_verbatim_evidence_at_all() -> None:
    answers = ["限流用令牌桶做单机限流。"]
    raw = [{"dimension": "correctness", "score": 90, "evidence": ["候选人回答得不错。"]}]
    with pytest.raises(ModelOutputInvalid):
        interview_service._coerce_scores(raw, answers)


def test_generate_questions_rejects_when_all_kinds_invalid(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        interview_service.llm,
        "chat_json",
        lambda *a, **k: {
            "questions": [
                {"kind": "闲聊", "prompt": "题一", "referencePoints": ["要点"]},
                {"kind": "", "prompt": "题二", "referencePoints": ["要点"]},
                {"kind": "unknown", "prompt": "题三", "referencePoints": ["要点"]},
            ]
        },
    )
    with pytest.raises(ModelOutputInvalid):
        interview_service._generate_questions(
            db_session, USER.id, role="Java 后端", jd_body="JD", resume_text="简历", count=3
        )


def test_generate_questions_coerces_partial_invalid_kinds(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        interview_service.llm,
        "chat_json",
        lambda *a, **k: {
            "questions": [
                {"kind": "technical", "prompt": "题一", "referencePoints": ["要点"]},
                {"kind": "行为", "prompt": "题二", "referencePoints": ["要点"]},
                {"kind": "situational", "prompt": "题三", "referencePoints": ["要点"]},
            ]
        },
    )
    items = interview_service._generate_questions(
        db_session, USER.id, role="Java 后端", jd_body="JD", resume_text="简历", count=3
    )
    assert [item["kind"] for item in items] == ["technical", "technical", "situational"]
