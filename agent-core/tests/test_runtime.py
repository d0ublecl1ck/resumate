"""C-09 loop skeleton: model provider injection, budget, cancel, events."""

from __future__ import annotations

import json

import httpx

from conftest import (
    apply_payload,
    capability_payload,
    preview_payload,
    result_payload,
    turn_payload,
    working_document_payload,
)
from resumate_agent_core import AgentRuntime, CancellationToken, Message, ModelResponse
from resumate_agent_core.runtime import (
    BudgetExceeded,
    ErrorEvent,
    FinalizeEvent,
    MessageEvent,
    PendingActionEvent,
    RunBudget,
    ToolCall,
    ToolProgressEvent,
)


class ScriptedProvider:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    def complete(self, messages, tools):
        self.calls.append(list(messages))
        assert tools, "runtime must advertise tools"
        return self._responses.pop(0)


class RepeatingProvider:
    def __init__(self, response):
        self.response = response
        self.count = 0

    def complete(self, messages, tools):
        self.count += 1
        return self.response


def body_of(request: httpx.Request):
    return json.loads(request.content) if request.content else None


def runtime_router():
    calls = []

    def handler(request):
        path = request.url.path
        calls.append({"method": request.method, "path": path, "body": body_of(request)})
        if path == "/resumes/res_1/turns":
            return httpx.Response(201, json=turn_payload())
        if path == "/resumes/res_1/working-document":
            return httpx.Response(200, json=working_document_payload())
        if path == "/turns/turn_1/patches:preview":
            return httpx.Response(200, json=preview_payload())
        if path == "/turns/turn_1/patches:apply":
            return httpx.Response(200, json=apply_payload())
        if path == "/turns/turn_1/finalize":
            return httpx.Response(200, json=turn_payload(state="finalized", result=result_payload()))
        if path == "/turns/turn_1/cancel":
            return httpx.Response(
                200,
                json=turn_payload(state="cancelled", result=result_payload(state="cancelled", versionId=None)),
            )
        if path == "/.well-known/resume-agent":
            return httpx.Response(200, json=capability_payload())
        raise AssertionError(f"unexpected {request.method} {path}")

    return handler, calls


def test_natural_completion_runs_tools_then_finalizes(make_client):
    provider = ScriptedProvider(
        [
            ModelResponse(
                message=Message(
                    role="assistant",
                    content="Inspecting the working copy",
                    tool_calls=(
                        ToolCall(id="c1", name="get_working_document", arguments={"resume_id": "res_1"}),
                    ),
                ),
                input_tokens=10,
                output_tokens=5,
            ),
            ModelResponse(
                message=Message(role="assistant", content="Done"),
                input_tokens=5,
                output_tokens=5,
            ),
        ]
    )
    handler, calls = runtime_router()
    with make_client(handler) as client:
        events = list(AgentRuntime(client, provider).run("res_1", "tighten bullets"))

    types = [event.type for event in events]
    assert types[0] == "message"
    assert "tool_progress" in types
    assert types[-1] == "finalize"
    finalize = events[-1]
    assert isinstance(finalize, FinalizeEvent)
    assert finalize.result is not None
    assert finalize.result.version_id == "ver_1"

    tool_events = [event for event in events if isinstance(event, ToolProgressEvent)]
    assert [event.phase for event in tool_events] == ["started", "completed"]
    assert tool_events[0].name == "get_working_document"
    assert tool_events[1].result["resumeId"] == "res_1"

    assert provider.calls[1][-1].role == "tool"
    assert any(call["path"] == "/turns/turn_1/finalize" for call in calls)


def test_preview_patch_emits_pending_action_event(make_client):
    provider = ScriptedProvider(
        [
            ModelResponse(
                message=Message(
                    role="assistant",
                    tool_calls=(
                        ToolCall(
                            id="c1",
                            name="preview_patch",
                            arguments={"ops": [{"op": "removeSection", "sectionId": "s1"}]},
                        ),
                    ),
                ),
                input_tokens=1,
                output_tokens=1,
            ),
            ModelResponse(message=Message(role="assistant", content="waiting for approval"), input_tokens=1, output_tokens=1),
        ]
    )
    handler, calls = runtime_router()
    with make_client(handler) as client:
        events = list(AgentRuntime(client, provider).run("res_1", "remove a section"))

    pending = [event for event in events if isinstance(event, PendingActionEvent)]
    assert len(pending) == 1
    assert pending[0].pending_action_id == "pa_1"
    assert pending[0].preview.requires_confirmation is True
    preview_calls = [call for call in calls if call["path"].endswith("patches:preview")]
    assert len(preview_calls) == 1


def test_turn_id_is_injected_into_tool_arguments(make_client):
    provider = ScriptedProvider(
        [
            ModelResponse(
                message=Message(
                    role="assistant",
                    tool_calls=(
                        ToolCall(
                            id="c1",
                            name="preview_patch",
                            arguments={"ops": [{"op": "removeSection", "sectionId": "s1"}]},
                        ),
                    ),
                ),
                input_tokens=1,
                output_tokens=1,
            ),
            ModelResponse(message=Message(role="assistant", content="ok"), input_tokens=1, output_tokens=1),
        ]
    )
    handler, calls = runtime_router()
    with make_client(handler) as client:
        list(AgentRuntime(client, provider).run("res_1", "go"))

    preview_call = next(call for call in calls if call["path"].endswith("patches:preview"))
    assert preview_call["body"]["ops"] == [{"op": "removeSection", "sectionId": "s1"}]


def test_token_budget_exhaustion_aborts_and_cancels(make_client):
    provider = ScriptedProvider(
        [ModelResponse(message=Message(role="assistant", content="expensive"), output_tokens=1000)]
    )
    handler, calls = runtime_router()
    with make_client(handler) as client:
        events = list(
            AgentRuntime(client, provider, budget=RunBudget(max_tokens=10)).run("res_1", "go")
        )

    error = events[-1]
    assert isinstance(error, ErrorEvent)
    assert error.code == "BUDGET_EXCEEDED"
    assert error.detail == "max_tokens"
    assert any(call["path"] == "/turns/turn_1/cancel" for call in calls)


def test_max_turns_exhaustion_aborts(make_client):
    provider = RepeatingProvider(
        ModelResponse(
            message=Message(
                role="assistant",
                tool_calls=(ToolCall(id="c1", name="capability", arguments={}),),
            ),
            input_tokens=1,
            output_tokens=1,
        )
    )
    handler, _ = runtime_router()
    with make_client(handler) as client:
        events = list(
            AgentRuntime(client, provider, budget=RunBudget(max_turns=2)).run("res_1", "loop")
        )

    error = events[-1]
    assert isinstance(error, ErrorEvent)
    assert error.code == "BUDGET_EXCEEDED"
    assert error.detail == "max_turns"
    assert provider.count == 2


def test_cancellation_before_first_model_call(make_client):
    token = CancellationToken()
    token.cancel()
    provider = ScriptedProvider([])
    handler, calls = runtime_router()
    with make_client(handler) as client:
        events = list(AgentRuntime(client, provider, cancellation=token).run("res_1", "go"))

    error = events[-1]
    assert isinstance(error, ErrorEvent)
    assert error.code == "CANCELLED"
    assert provider.calls == []
    assert any(call["path"] == "/turns/turn_1/cancel" for call in calls)


def test_run_budget_validation_and_snapshot():
    budget = RunBudget(max_tokens=100, max_turns=3, max_cost_usd=1.5)
    budget.start_turn()
    budget.consume(ModelResponse(message=Message(role="assistant", content="x"), input_tokens=10, output_tokens=5, cost_usd=0.25))
    snapshot = budget.snapshot()
    assert snapshot["turnsUsed"] == 1
    assert snapshot["tokensUsed"] == 15
    assert snapshot["costUsedUsd"] == 0.25

    import pytest

    with pytest.raises(ValueError):
        RunBudget(max_turns=0)
    with pytest.raises(BudgetExceeded):
        RunBudget(max_tokens=1).consume(
            ModelResponse(message=Message(role="assistant"), output_tokens=2)
        )
