"""profile 作用域的会话绑定：模型不能用自己的猜测压掉运行体的 session (issue 91eeb)。

原缺陷有两条链：`bound_system_prompt` 对 profile 作用域不注入任何绑定；`_invoke` 又只在模型
「没给」session_id 时才注入，于是模型自猜的 id 一路走到后端变成 RESOURCE_NOT_FOUND。
下面的 FakeProfileApi 像真实后端一样，收到未知 sessionId 就返回 404 RESOURCE_NOT_FOUND。
"""

from __future__ import annotations

import json

import httpx
import pytest

from conftest import turn_payload
from resumate_agent_core.errors import ApiClientError
from resumate_agent_core.runtime import (
    AgentRuntime,
    ErrorEvent,
    Message,
    ModelResponse,
    ToolCall,
    ToolProgressEvent,
    bound_system_prompt,
)
from resumate_agent_core.session import SessionJournal
from resumate_agent_core.turn import TurnSession

CREATED_AT = "2026-01-01T00:00:00Z"
REAL_SESSION = "ses_1"


class FakeProfileApi:
    """In-memory profile-scope server: `POST /turns` only accepts a known session."""

    def __init__(self) -> None:
        self.sessions: dict[str, dict] = {}
        self.messages: dict[str, list[dict]] = {}
        self.profile_turn_bodies: list[dict] = []
        self._messages = 0

    # --- server behaviour ---------------------------------------------------

    def ensure_session(self, session_id: str = REAL_SESSION) -> str:
        self.sessions[session_id] = {
            "id": session_id,
            "createdAt": CREATED_AT,
            "updatedAt": CREATED_AT,
            "lastActiveAt": CREATED_AT,
        }
        self.messages.setdefault(session_id, [])
        return session_id

    def _create_session(self) -> str:
        return self.ensure_session(REAL_SESSION if not self.sessions else f"ses_{len(self.sessions) + 1}")

    def _profile_turn(self, body: dict) -> httpx.Response:
        session_id = str(body.get("sessionId") or "")
        if session_id not in self.sessions:
            return httpx.Response(
                404,
                json={"code": "RESOURCE_NOT_FOUND", "message": f"会话 {session_id} 不存在"},
            )
        self.profile_turn_bodies.append(body)
        return httpx.Response(
            201,
            json=turn_payload(resumeId=None, scope="profile", sessionId=session_id),
        )

    def handler(self, request: httpx.Request) -> httpx.Response:
        path, method = request.url.path, request.method
        body = json.loads(request.content) if request.content else {}
        if path == "/sessions" and method == "POST":
            session_id = self._create_session()
            return httpx.Response(201, json=self.sessions[session_id])
        if path == "/sessions" and method == "GET":
            return httpx.Response(200, json=list(self.sessions.values()))
        if path.startswith("/sessions/") and path.endswith("/messages"):
            session_id = path.split("/")[2]
            if method == "POST":
                self._messages += 1
                row = {
                    "id": f"msg_{self._messages}",
                    "sessionId": session_id,
                    "seq": body["seq"],
                    "role": body["role"],
                    "content": body["content"],
                    "createdAt": CREATED_AT,
                }
                self.messages.setdefault(session_id, []).append(row)
                return httpx.Response(201, json=row)
            rows = [
                row
                for row in self.messages.get(session_id, [])
                if row["seq"] > int(request.url.params.get("afterSeq", 0))
            ]
            return httpx.Response(200, json=rows)
        if path == "/turns" and method == "POST":
            return self._profile_turn(body)
        if path == "/turns/turn_1" and method == "GET":
            return httpx.Response(200, json=turn_payload(resumeId=None, scope="profile", sessionId=REAL_SESSION))
        raise AssertionError(f"unexpected {method} {path}")


class ScriptedProvider:
    """One scripted completion per model turn."""

    def __init__(self, responses) -> None:
        self._responses = list(responses)

    def complete(self, messages, tools):
        return self._responses.pop(0)


def create_turn_call(**arguments) -> ModelResponse:
    return ModelResponse(
        message=Message(
            role="assistant",
            content="Opening a profile turn",
            tool_calls=(ToolCall(id="c1", name="create_turn", arguments=dict(arguments)),),
        ),
        input_tokens=1,
        output_tokens=1,
    )


def done_response() -> ModelResponse:
    return ModelResponse(message=Message(role="assistant", content="Done"))


def profile_runtime(client, provider) -> AgentRuntime:
    return AgentRuntime(
        client,
        provider,
        scope="profile",
        sessions=SessionJournal(client),
        auto_finalize=False,
    )


def invoke_create_turn(runtime: AgentRuntime, session_id: str | None, arguments: dict) -> None:
    """Drive one create_turn call through the real tool handler."""
    runtime.session_id = session_id
    turn_session = TurnSession(runtime.client, None, session_id=session_id, scope="profile")
    runtime._invoke(turn_session, ToolCall(id="c1", name="create_turn", arguments=arguments))


def test_invoke_forces_the_runtime_session_over_a_guessed_one(make_client) -> None:
    """工具层：模型给了伪造 session_id 也一律被运行体自己的 session 覆盖。"""
    fake = FakeProfileApi()
    fake.ensure_session()
    with make_client(fake.handler) as client:
        runtime = AgentRuntime(client, ScriptedProvider([]), scope="profile")
        invoke_create_turn(runtime, REAL_SESSION, {"session_id": "sess_wrong"})

    assert [body["sessionId"] for body in fake.profile_turn_bodies] == [REAL_SESSION]


def test_invoke_injects_the_runtime_session_when_the_model_omits_it(make_client) -> None:
    fake = FakeProfileApi()
    fake.ensure_session()
    with make_client(fake.handler) as client:
        runtime = AgentRuntime(client, ScriptedProvider([]), scope="profile")
        invoke_create_turn(runtime, REAL_SESSION, {})

    assert [body["sessionId"] for body in fake.profile_turn_bodies] == [REAL_SESSION]


def test_invoke_does_not_fabricate_a_session_when_the_run_has_none(make_client) -> None:
    """self.session_id 为 None 时不注入空串，模型自猜的 id 到后端就会被拒。"""
    fake = FakeProfileApi()
    fake.ensure_session()
    with make_client(fake.handler) as client:
        runtime = AgentRuntime(client, ScriptedProvider([]), scope="profile")
        with pytest.raises(ApiClientError) as excinfo:
            invoke_create_turn(runtime, None, {"session_id": "sess_wrong"})

    assert excinfo.value.code == "RESOURCE_NOT_FOUND"
    assert fake.profile_turn_bodies == []


def test_backend_never_receives_a_guessed_profile_session(make_client) -> None:
    """复现原缺陷：模型自猜 session_id，最终发给后端的必须是运行体自己的 session。"""
    fake = FakeProfileApi()
    provider = ScriptedProvider([create_turn_call(session_id="sess_guessed"), done_response()])
    with make_client(fake.handler) as client:
        runtime = profile_runtime(client, provider)
        events = list(runtime.run(None, "我叫黄鹏星 20050303", scope="profile"))
        session_id = runtime.session_id

    assert session_id == REAL_SESSION
    assert fake.profile_turn_bodies, "模型自开的 turn 必须真的到后端"
    assert {body["sessionId"] for body in fake.profile_turn_bodies} == {session_id}
    assert "sess_guessed" not in json.dumps(fake.profile_turn_bodies, ensure_ascii=False)
    failed = [event for event in events if isinstance(event, ToolProgressEvent) and event.phase == "failed"]
    assert failed == [], f"伪造的 session_id 不应该被后端拒绝：{[event.detail for event in failed]}"


def test_backend_never_receives_a_guessed_profile_session_when_omitted(make_client) -> None:
    """模型没给 session_id 时仍然注入运行体自己的 session（保留既有兜底行为）。"""
    fake = FakeProfileApi()
    provider = ScriptedProvider([create_turn_call(), done_response()])
    with make_client(fake.handler) as client:
        runtime = profile_runtime(client, provider)
        list(runtime.run(None, "我叫黄鹏星 20050303", scope="profile"))
        session_id = runtime.session_id

    assert fake.profile_turn_bodies
    assert {body["sessionId"] for body in fake.profile_turn_bodies} == {session_id}


def test_unknown_session_is_still_rejected_as_the_original_defect(make_client) -> None:
    """原缺陷现场：没有真实 session 兜底时，会话就算建不起来也不会猜一个 id。"""
    fake = FakeProfileApi()
    fake.ensure_session()
    provider = ScriptedProvider([create_turn_call(session_id="sess_default"), done_response()])
    with make_client(fake.handler) as client:
        runtime = AgentRuntime(client, provider, scope="profile", auto_finalize=False)
        runtime.session_id = None
        events = list(runtime.run(None, "我叫黄鹏星 20050303", scope="profile"))

    assert fake.profile_turn_bodies == []
    assert "sess_default" not in json.dumps(fake.sessions, ensure_ascii=False)
    assert any(
        isinstance(event, ErrorEvent)
        and event.code == "RESOURCE_NOT_FOUND"
        and event.detail == "begin failed"
        for event in events
    )


def test_profile_prompt_names_the_session_scope_and_open_turn() -> None:
    prompt = bound_system_prompt(
        "base prompt",
        resume_id=None,
        scope="profile",
        turn_id="turn_1",
        session_id="ses_1",
    )

    assert "base prompt" in prompt
    assert "ses_1" in prompt
    assert "profile" in prompt
    assert "turn_1" in prompt
    assert "create_turn" in prompt
    # profile 作用域没有简历绑定，绝不能出现简历绑定段。
    assert "This run is bound to resume" not in prompt


def test_profile_prompt_omits_the_turn_rule_without_an_open_turn() -> None:
    prompt = bound_system_prompt(
        "base prompt",
        resume_id=None,
        scope="profile",
        session_id="ses_1",
    )

    assert "ses_1" in prompt
    assert "turn_1" not in prompt


def test_profile_prompt_without_a_session_says_nothing_it_cannot_back() -> None:
    """self.session_id 为 None 时不编造绑定，也不得写出空 id。"""
    prompt = bound_system_prompt("base prompt", resume_id=None, scope="profile")

    assert "base prompt" in prompt
    assert "None" not in prompt


def test_resume_scope_keeps_its_existing_binding_wording() -> None:
    bound = bound_system_prompt("base", resume_id="res_1", scope="resume", turn_id="turn_9")

    assert "This run is bound to resume res_1" in bound
    assert "An editing turn is already open (turn_9)" in bound
    assert "profile" not in bound


def test_resume_scope_does_not_grow_a_session_section() -> None:
    """resume 作用域的提示词逐字不变：会话绑定只补 profile 作用域。"""
    with_session = bound_system_prompt(
        "base",
        resume_id="res_1",
        scope="resume",
        turn_id="turn_9",
        session_id="ses_1",
    )
    without = bound_system_prompt("base", resume_id="res_1", scope="resume", turn_id="turn_9")

    assert with_session == without
    assert "ses_1" not in with_session
