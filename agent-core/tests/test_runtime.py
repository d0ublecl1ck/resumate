"""C-09 loop skeleton: model provider injection, budget, cancel, events."""

from __future__ import annotations

import json

import httpx

from conftest import (
    apply_payload,
    capability_payload,
    pending_payload,
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


def test_bound_system_prompt_names_the_resume_only_for_resume_scope():
    from resumate_agent_core.runtime import bound_system_prompt

    prompt = bound_system_prompt("base prompt", resume_id="res_1", scope="resume")
    assert "same language as the user's latest message" in prompt
    assert "res_1" in prompt
    assert "never" in prompt.lower()
    # 语言指令对所有 scope 生效；简历绑定段只对 resume scope 生效。
    unbound = bound_system_prompt("base prompt", resume_id=None, scope="resume")
    profile = bound_system_prompt("base prompt", resume_id="res_1", scope="profile")
    for prompt in (unbound, profile):
        assert "base prompt" in prompt
        assert "same language as the user's latest message" in prompt
        assert "This run is bound to resume" not in prompt


def test_bound_system_prompt_reuses_the_open_turn():
    from resumate_agent_core.runtime import bound_system_prompt

    prompt = bound_system_prompt("base prompt", resume_id="res_1", scope="resume", turn_id="turn_1")
    assert "turn_1" in prompt
    assert "create_turn" in prompt

    without_turn = bound_system_prompt("base prompt", resume_id="res_1", scope="resume")
    assert "turn_1" not in without_turn


def test_opening_context_tells_the_model_which_resume_it_is_bound_to(make_client):
    provider = ScriptedProvider(
        [ModelResponse(message=Message(role="assistant", content="Done"), input_tokens=1, output_tokens=1)]
    )
    handler, _ = runtime_router()
    with make_client(handler) as client:
        list(AgentRuntime(client, provider).run("res_1", "tighten bullets"))

    opening = provider.calls[0]
    assert opening[0].role == "system"
    assert "res_1" in opening[0].content
    # The runtime already opened turn_1; the model must not open a second one.
    assert "turn_1" in opening[0].content
    assert "create_turn" in opening[0].content
    assert opening[1].role == "user"
    assert opening[1].content == "tighten bullets"


def test_runtime_overrides_a_guessed_resume_id(make_client):
    provider = ScriptedProvider(
        [
            ModelResponse(
                message=Message(
                    role="assistant",
                    tool_calls=(
                        ToolCall(id="c1", name="get_working_document", arguments={"resume_id": "res_wrong"}),
                    ),
                ),
                input_tokens=1,
                output_tokens=1,
            ),
            ModelResponse(message=Message(role="assistant", content="Done"), input_tokens=1, output_tokens=1),
        ]
    )
    handler, calls = runtime_router()
    with make_client(handler) as client:
        events = list(AgentRuntime(client, provider).run("res_1", "read the copy"))

    assert any(call["path"] == "/resumes/res_1/working-document" for call in calls)
    assert not any("res_wrong" in str(call["path"]) for call in calls)
    tool_events = [event for event in events if isinstance(event, ToolProgressEvent)]
    assert tool_events
    assert tool_events[-1].result["resumeId"] == "res_1"


def test_runtime_injects_the_bound_resume_id_when_the_model_omits_it(make_client):
    provider = ScriptedProvider(
        [
            ModelResponse(
                message=Message(
                    role="assistant",
                    tool_calls=(ToolCall(id="c1", name="get_working_document", arguments={}),),
                ),
                input_tokens=1,
                output_tokens=1,
            ),
            ModelResponse(message=Message(role="assistant", content="Done"), input_tokens=1, output_tokens=1),
        ]
    )
    handler, calls = runtime_router()
    with make_client(handler) as client:
        list(AgentRuntime(client, provider).run("res_1", "read the copy"))

    assert any(call["path"] == "/resumes/res_1/working-document" for call in calls)

def approval_router(decision_after: int):
    """Router whose pending action flips to `approved` after N polls."""
    state = {"polls": 0}
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
        if path == "/turns/turn_1/pending-actions":
            state["polls"] += 1
            pending_state = "approved" if state["polls"] > decision_after else "pending"
            return httpx.Response(200, json=[pending_payload(state=pending_state)])
        if path == "/turns/turn_1/patches:apply":
            return httpx.Response(200, json=apply_payload())
        if path == "/turns/turn_1/finalize":
            return httpx.Response(200, json=turn_payload(state="finalized", result=result_payload()))
        if path == "/.well-known/resume-agent":
            return httpx.Response(200, json=capability_payload())
        raise AssertionError(f"unexpected {request.method} {path}")

    return handler, calls


PREVIEW_CALL = ToolCall(
    id="c1",
    name="preview_patch",
    arguments={"turn_id": "turn_1", "ops": [{"op": "setBasics", "basics": {"headline": "资深后端工程师"}}], "reason": "改头衔"},
)


def test_approval_mode_waits_for_the_human_then_applies_once(make_client):
    provider = ScriptedProvider(
        [
            ModelResponse(message=Message(role="assistant", content="准备改动", tool_calls=(PREVIEW_CALL,)), input_tokens=10, output_tokens=5),
            ModelResponse(message=Message(role="assistant", content="已写入"), input_tokens=5, output_tokens=5),
        ]
    )
    handler, calls = approval_router(decision_after=1)

    with make_client(handler) as client:
        runtime = AgentRuntime(client, provider, approval_poll_seconds=0.001, approval_timeout_seconds=1.0)
        events = list(runtime.run("res_1", "改头衔"))

    assert provider.calls and len(provider.calls) == 2, "等待人工批准期间不应再调用模型"
    assert [call["path"] for call in calls].count("/turns/turn_1/patches:apply") == 1
    assert not [event for event in events if isinstance(event, ErrorEvent) and event.code == "BUDGET_EXCEEDED"]
    assert isinstance(events[-1], FinalizeEvent)
    assert any(isinstance(event, PendingActionEvent) for event in events)

    # 第二条模型调用看到的消息里，每条 assistant tool_call 后面必须紧跟它的 tool 结果，
    # 否则 OpenAI 兼容端点会 400（实测 MODEL_ERROR）。
    history = provider.calls[-1]
    for index, message in enumerate(history[:-1]):
        if message.role != "assistant" or not message.tool_calls:
            continue
        expected = [call.id for call in message.tool_calls]
        following = history[index + 1]
        assert following.role == "tool" and following.tool_call_id == expected[-1]


def test_approval_mode_times_out_without_burning_more_model_turns(make_client):
    provider = ScriptedProvider(
        [ModelResponse(message=Message(role="assistant", content="准备改动", tool_calls=(PREVIEW_CALL,)), input_tokens=10, output_tokens=5)]
    )
    handler, calls = approval_router(decision_after=999)

    with make_client(handler) as client:
        runtime = AgentRuntime(client, provider, approval_poll_seconds=0.001, approval_timeout_seconds=0.05)
        events = list(runtime.run("res_1", "改头衔"))

    assert len(provider.calls) == 1
    assert [call["path"] for call in calls].count("/turns/turn_1/patches:apply") == 0
    assert [call["path"] for call in calls].count("/turns/turn_1/finalize") == 0
    assert any(isinstance(event, MessageEvent) and "等你在界面上批准" in event.text for event in events)
    assert not any(isinstance(event, FinalizeEvent) for event in events)


def test_second_preview_is_refused_while_a_pending_action_is_open(make_client):
    provider = ScriptedProvider(
        [
            ModelResponse(message=Message(role="assistant", content="第一次预览", tool_calls=(PREVIEW_CALL,)), input_tokens=10, output_tokens=5),
            ModelResponse(
                message=Message(
                    role="assistant",
                    content="再预览一次",
                    tool_calls=(ToolCall(id="c2", name="preview_patch", arguments=dict(PREVIEW_CALL.arguments)),),
                ),
                input_tokens=10,
                output_tokens=5,
            ),
            ModelResponse(message=Message(role="assistant", content="停在这里"), input_tokens=5, output_tokens=5),
        ]
    )
    handler, calls = approval_router(decision_after=1)

    with make_client(handler) as client:
        # 不接管等待（库内默认）时，待办会一直开着 —— 这正是需要拦住重复 preview 的场景。
        events = list(AgentRuntime(client, provider).run("res_1", "改头衔"))

    assert [call["path"] for call in calls].count("/turns/turn_1/patches:preview") == 1
    assert any(
        isinstance(event, ToolProgressEvent) and event.phase == "failed" and "PENDING_ACTION_OPEN" in (event.detail or "")
        for event in events
    )
    assert not [event for event in events if isinstance(event, ErrorEvent) and event.code == "BUDGET_EXCEEDED"]

