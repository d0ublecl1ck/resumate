"""Session client, checkpoint store and resume (issue 9d29a)."""

from __future__ import annotations

import json

import httpx

from conftest import result_payload, turn_payload
from resumate_agent_core import AgentRuntime, Message, ModelResponse
from resumate_agent_core.checkpoint import CheckpointStore, messages_from_run_state
from resumate_agent_core.runtime import FinalizeEvent, MessageEvent, RunBudget, ToolCall

SESSION = {
    "id": "sess_1",
    "createdAt": "2026-01-01T00:00:00Z",
    "updatedAt": "2026-01-01T00:00:00Z",
    "lastActiveAt": "2026-01-01T00:00:00Z",
}


def body_of(request: httpx.Request):
    return json.loads(request.content) if request.content else None


class ScriptedProvider:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def complete(self, messages, tools):
        self.calls.append(list(messages))
        return self._responses.pop(0)


def session_router(initial_state=None):
    calls: list[dict] = []
    state = {
        "runState": (initial_state or {}),
        "stateVersion": 1 if initial_state else 0,
    }

    def handler(request):
        path = request.url.path
        calls.append({"method": request.method, "path": path, "body": body_of(request)})
        if path == "/sessions" and request.method == "POST":
            return httpx.Response(201, json=SESSION)
        if path == "/sessions" and request.method == "GET":
            return httpx.Response(200, json=[SESSION])
        if path == "/sessions/sess_1/messages" and request.method == "POST":
            body = body_of(request)
            return httpx.Response(
                201,
                json={
                    "id": "msg_1",
                    "sessionId": "sess_1",
                    "seq": body["seq"],
                    "role": body["role"],
                    "content": body["content"],
                    "createdAt": "2026-01-01T00:00:00Z",
                },
            )
        if path == "/sessions/sess_1/messages" and request.method == "GET":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": "msg_1",
                        "sessionId": "sess_1",
                        "seq": 1,
                        "role": "user",
                        "content": "hi",
                        "createdAt": "2026-01-01T00:00:00Z",
                    }
                ],
            )
        if path == "/turns/turn_1/state" and request.method == "GET":
            return httpx.Response(200, json={"turnId": "turn_1", **state})
        if path == "/turns/turn_1/state" and request.method == "PUT":
            body = body_of(request)
            state["runState"] = body["runState"]
            state["stateVersion"] = body["stateVersion"] + 1
            return httpx.Response(200, json={"turnId": "turn_1", **state})
        if path == "/turns/turn_1" and request.method == "GET":
            return httpx.Response(200, json=turn_payload())
        if path == "/turns/turn_1/finalize":
            return httpx.Response(200, json=turn_payload(state="finalized", result=result_payload()))
        if path == "/resumes/res_1/turns":
            body = body_of(request) or {}
            return httpx.Response(201, json=turn_payload(sessionId=body.get("sessionId")))
        raise AssertionError(f"unexpected {request.method} {path}")

    return handler, calls, state


def test_session_and_message_client_paths(make_client):
    handler, calls, _ = session_router()
    with make_client(handler) as client:
        session = client.create_session()
        sessions = client.list_sessions()
        message = client.append_session_message("sess_1", seq=1, role="user", content="hi")
        messages = client.list_session_messages("sess_1", after_seq=0)

    assert session.id == "sess_1"
    assert [item.id for item in sessions] == ["sess_1"]
    assert message.id == "msg_1" and message.seq == 1 and message.content == "hi"
    assert [item.seq for item in messages] == [1]
    get_call = next(call for call in calls if call["path"] == "/sessions/sess_1/messages" and call["method"] == "GET")
    assert get_call["body"] is None  # afterSeq is a query parameter, not a body


def test_turn_state_client_roundtrip(make_client):
    handler, calls, _ = session_router()
    with make_client(handler) as client:
        initial = client.get_turn_state("turn_1")
        saved = client.update_turn_state("turn_1", state_version=initial.state_version, run_state={"phase": "running"})

    assert initial.state_version == 0 and initial.run_state == {}
    assert saved.state_version == 1 and saved.run_state == {"phase": "running"}
    put_call = next(call for call in calls if call["method"] == "PUT")
    assert put_call["body"] == {"stateVersion": 0, "runState": {"phase": "running"}}


def test_create_turn_sends_session_id(make_client):
    handler, calls, _ = session_router()
    with make_client(handler) as client:
        turn = client.create_turn("res_1", session_id="sess_1")

    assert turn.session_id == "sess_1"
    create_call = next(call for call in calls if call["path"] == "/resumes/res_1/turns")
    assert create_call["body"]["sessionId"] == "sess_1"


def test_checkpoint_store_persists_messages_and_budget(make_client):
    handler, calls, _ = session_router()
    budget = RunBudget(max_tokens=1000, max_turns=4, max_cost_usd=1.0)
    budget.start_turn()
    budget.consume(ModelResponse(message=Message(role="assistant", content="x"), input_tokens=10, output_tokens=5, cost_usd=0.25))
    messages = [Message(role="user", content="hi"), Message(role="assistant", content="x")]

    with make_client(handler) as client:
        store = CheckpointStore(client)
        saved = store.save("turn_1", messages=messages, budget=budget, phase="running")
        loaded = store.load("turn_1")

    assert saved.state_version == 1
    assert loaded.run_state["phase"] == "running"
    assert loaded.run_state["budget"]["tokensUsed"] == 15
    assert loaded.run_state["messages"][0] == {"role": "user", "content": "hi"}
    assert messages_from_run_state(loaded.run_state)[1].content == "x"
    assert len([call for call in calls if call["method"] == "PUT"]) == 1


def test_runtime_checkpoints_after_every_model_call(make_client):
    state = {}
    handler, calls, _ = session_router()
    provider = ScriptedProvider(
        [
            ModelResponse(
                message=Message(
                    role="assistant",
                    tool_calls=(ToolCall(id="c1", name="get_turn", arguments={"turn_id": "turn_1"}),),
                ),
                input_tokens=3,
                output_tokens=2,
            ),
            ModelResponse(message=Message(role="assistant", content="done"), input_tokens=3, output_tokens=2),
        ]
    )
    with make_client(handler) as client:
        store = CheckpointStore(client)
        events = list(AgentRuntime(client, provider, checkpoint=store).run("res_1", "go"))

    puts = [call for call in calls if call["method"] == "PUT"]
    assert len(puts) >= 2, "expected one checkpoint per model turn"
    last_messages = puts[-1]["body"]["runState"]["messages"]
    assert any(message["role"] == "tool" for message in last_messages)
    assert puts[-1]["body"]["runState"]["budget"]["turnsUsed"] == 2
    assert any(isinstance(event, FinalizeEvent) for event in events)


def test_runtime_resume_restores_messages_and_budget_from_store(make_client):
    stored = {
        "phase": "running",
        "pendingActionId": None,
        "budget": {"turnsUsed": 1, "tokensUsed": 25, "costUsedUsd": 0.5, "maxTurns": 8, "maxTokens": 1000, "maxCostUsd": 2.0},
        "messages": [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "go"},
            {"role": "assistant", "content": "", "toolCalls": [{"id": "c1", "name": "get_turn", "arguments": {"turn_id": "turn_1"}}]},
            {"role": "tool", "content": "turn_1 checkpoint", "toolCallId": "c1", "name": "get_turn"},
        ],
    }
    handler, calls, _ = session_router(initial_state=stored)
    provider = ScriptedProvider([ModelResponse(message=Message(role="assistant", content="finished"), input_tokens=1, output_tokens=1)])

    with make_client(handler) as client:
        runtime = AgentRuntime(client, provider, checkpoint=CheckpointStore(client))
        events = list(runtime.resume("turn_1"))

    first_call_messages = provider.calls[0]
    assert first_call_messages[-1].role == "tool"
    assert "turn_1" in (first_call_messages[-1].content or "")
    assert runtime.budget.max_turns == 8
    assert runtime.budget.tokens_used >= 25
    assert any(isinstance(event, FinalizeEvent) for event in events)
    assert any(call["path"] == "/turns/turn_1/state" and call["method"] == "GET" for call in calls)
