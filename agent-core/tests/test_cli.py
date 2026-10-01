"""CLI entry point: one agent run as a standalone process (issue 89ffd).

Every case runs against httpx.MockTransport and an injected model provider, so
the suite never touches the network, a real backend, or a real model.
"""

from __future__ import annotations

import io
import json
import tomllib
from datetime import datetime, timezone
from pathlib import Path

import httpx

from conftest import result_payload, turn_payload, working_document_payload
from resumate_agent_core import cli
from resumate_agent_core.runtime import Message, ModelResponse, ToolCall

T0 = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
T1 = datetime(2026, 1, 1, 0, 0, 5, tzinfo=timezone.utc)


class ScriptedProvider:
    """Deterministic ModelProvider: returns the scripted responses in order."""

    def __init__(self, responses, state_path: Path | None = None) -> None:
        self._responses = list(responses)
        self._state_path = state_path
        self.seen_during_run: list[dict] = []
        self.calls: list[list] = []

    def complete(self, messages, tools):
        self.calls.append(list(messages))
        if self._state_path is not None:
            self.seen_during_run.append(json.loads(self._state_path.read_text(encoding="utf-8")))
        return self._responses.pop(0)


def inspect_response() -> ModelResponse:
    return ModelResponse(
        message=Message(
            role="assistant",
            content="Inspecting the working copy",
            tool_calls=(ToolCall(id="c1", name="get_working_document", arguments={"resume_id": "res_1"}),),
        ),
        input_tokens=10,
        output_tokens=5,
    )


def done_response() -> ModelResponse:
    return ModelResponse(message=Message(role="assistant", content="Done"))


def shortest_path_router(*, turns_status: int = 201):
    """Turn creation -> one tool call -> finalize, over the frozen contract paths."""
    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        calls.append({"method": request.method, "path": path, "headers": dict(request.headers)})
        if path == "/resumes/res_1/turns" and request.method == "POST":
            if turns_status != 201:
                return httpx.Response(turns_status, json={"code": "FORBIDDEN", "message": "审批动作仅限人类会话"})
            return httpx.Response(201, json=turn_payload())
        if path == "/resumes/res_1/working-document":
            return httpx.Response(200, json=working_document_payload())
        if path == "/turns/turn_1/finalize":
            return httpx.Response(200, json=turn_payload(state="finalized", result=result_payload()))
        if path == "/turns/turn_1/state" and request.method == "GET":
            return httpx.Response(200, json={"turnId": "turn_1", "runState": {}, "stateVersion": 0})
        if path == "/turns/turn_1/state" and request.method == "PUT":
            return httpx.Response(200, json={"turnId": "turn_1", "runState": {}, "stateVersion": 1})
        raise AssertionError(f"unexpected {request.method} {path}")

    return handler, calls


def clock(*values: datetime):
    """Return a callable yielding the given timestamps in order, repeating the last."""
    queue = list(values)

    def _now() -> datetime:
        return queue.pop(0) if len(queue) > 1 else queue[0]

    return _now


def run_cli(argv, **kwargs):
    stdout = io.StringIO()
    stderr = io.StringIO()
    code = cli.main(argv, stdout=stdout, stderr=stderr, env={}, **kwargs)
    return code, stdout.getvalue(), stderr.getvalue()


def json_events(stdout: str) -> list[dict]:
    return [json.loads(line) for line in stdout.splitlines() if line.strip()]


def test_cli_runs_shortest_turn_and_emits_jsonl_events() -> None:
    handler, _ = shortest_path_router()
    provider = ScriptedProvider([inspect_response(), done_response()])

    code, stdout, stderr = run_cli(
        [
            "--resume-id",
            "res_1",
            "--prompt",
            "tighten bullets",
            "--execution-mode",
            "approval",
        ],
        transport=httpx.MockTransport(handler),
        provider=provider,
    )

    assert code == 0, stderr
    events = json_events(stdout)
    assert [event["type"] for event in events] == [
        "message",
        "tool_progress",
        "tool_progress",
        "message",
        "finalize",
    ]
    assert events[0]["text"] == "Inspecting the working copy"
    tool_events = [event for event in events if event["type"] == "tool_progress"]
    assert [event["phase"] for event in tool_events] == ["started", "completed"]
    assert tool_events[0]["name"] == "get_working_document"
    assert tool_events[1]["result"]["resumeId"] == "res_1"
    assert events[-1]["turn"]["state"] == "finalized"
    assert events[-1]["result"]["versionId"] == "ver_1"


def test_cli_writes_start_snapshot_before_the_first_model_call_and_finishes_it(tmp_path: Path) -> None:
    handler, _ = shortest_path_router()
    state_path = tmp_path / "run-state.json"
    provider = ScriptedProvider([inspect_response(), done_response()], state_path=state_path)

    code, stdout, stderr = run_cli(
        [
            "--resume-id",
            "res_1",
            "--prompt",
            "tighten bullets",
            "--execution-mode",
            "approval",
            "--state",
            str(state_path),
        ],
        transport=httpx.MockTransport(handler),
        provider=provider,
        now=clock(T0, T1),
    )

    assert code == 0, stderr
    assert provider.seen_during_run, "the model was never called"
    started = provider.seen_during_run[0]
    assert started["phase"] == "started"
    assert started["resumeId"] == "res_1"
    assert started["executionMode"] == "approval"
    assert started["startedAt"] == T0.isoformat()
    assert "endedAt" not in started

    finished = json.loads(state_path.read_text(encoding="utf-8"))
    assert finished["phase"] == "finished"
    assert finished["resumeId"] == "res_1"
    assert finished["startedAt"] == T0.isoformat()
    assert finished["endedAt"] == T1.isoformat()


def test_cli_reports_error_event_and_failed_state_on_rejected_turn(tmp_path: Path) -> None:
    handler, _ = shortest_path_router(turns_status=403)
    state_path = tmp_path / "run-state.json"

    code, stdout, stderr = run_cli(
        ["--resume-id", "res_1", "--prompt", "tighten bullets", "--state", str(state_path)],
        transport=httpx.MockTransport(handler),
        provider=ScriptedProvider([]),
        now=clock(T0, T1),
    )

    assert code == 1, stderr
    events = json_events(stdout)
    assert [event["type"] for event in events] == ["error"]
    assert events[0]["code"] == "FORBIDDEN"
    assert events[0]["message"]
    assert json.loads(state_path.read_text(encoding="utf-8"))["phase"] == "failed"


def test_cli_builds_the_provider_from_flags_without_printing_credentials() -> None:
    handler, calls = shortest_path_router()
    captured: list[dict] = []

    def provider_factory(**kwargs):
        captured.append(kwargs)
        return ScriptedProvider([inspect_response(), done_response()])

    code, stdout, stderr = run_cli(
        [
            "--resume-id",
            "res_1",
            "--prompt",
            "tighten bullets",
            "--model",
            "gpt-4o-mini",
            "--api-key",
            "sk-secret-value",
            "--provider-base-url",
            "https://provider.test/v1",
            "--session-cookie",
            "sess-secret-value",
        ],
        transport=httpx.MockTransport(handler),
        provider_factory=provider_factory,
    )

    assert code == 0, stderr
    assert captured[0]["model"] == "gpt-4o-mini"
    assert captured[0]["api_key"] == "sk-secret-value"
    assert captured[0]["base_url"] == "https://provider.test/v1"

    # The credential is wired into the request, but never echoed to the operator.
    turn_call = next(call for call in calls if call["path"] == "/resumes/res_1/turns")
    assert turn_call["headers"]["cookie"] == "resumate_session=sess-secret-value"
    printed = stdout + stderr
    assert "sk-secret-value" not in printed
    assert "sess-secret-value" not in printed


def test_cli_reads_connection_and_model_defaults_from_the_environment() -> None:
    handler, calls = shortest_path_router()
    captured: list[dict] = []

    def provider_factory(**kwargs):
        captured.append(kwargs)
        return ScriptedProvider([inspect_response(), done_response()])

    stdout = io.StringIO()
    stderr = io.StringIO()
    code = cli.main(
        ["--resume-id", "res_1", "--prompt", "tighten bullets"],
        env={
            "RESUME_AGENT_CORE_BASE_URL": "http://env.test",
            "RESUME_AGENT_CORE_TOKEN": "pat-from-env",
            "RESUME_AGENT_CORE_MODEL": "env-model",
            "RESUME_AGENT_CORE_PROVIDER_BASE_URL": "http://env-provider.test/v1",
            "RESUME_AGENT_CORE_EXECUTION_MODE": "full_access",
        },
        transport=httpx.MockTransport(handler),
        provider_factory=provider_factory,
        stdout=stdout,
        stderr=stderr,
    )

    assert code == 0, stderr.getvalue()
    assert captured[0]["model"] == "env-model"
    assert captured[0]["base_url"] == "http://env-provider.test/v1"
    turn_call = next(call for call in calls if call["path"] == "/resumes/res_1/turns")
    assert turn_call["headers"]["authorization"] == "Bearer pat-from-env"
    body = json.loads(turn_call["body"]) if "body" in turn_call else None
    assert body is None or body.get("executionMode") == "full_access"


def test_cli_text_mode_is_human_readable() -> None:
    handler, _ = shortest_path_router()
    provider = ScriptedProvider([inspect_response(), done_response()])

    code, stdout, stderr = run_cli(
        ["--resume-id", "res_1", "--prompt", "tighten bullets", "--events", "text"],
        transport=httpx.MockTransport(handler),
        provider=provider,
    )

    assert code == 0, stderr
    lines = [line for line in stdout.splitlines() if line.strip()]
    assert lines
    for line in lines:
        try:
            json.loads(line)
        except ValueError:
            continue
        raise AssertionError(f"text mode must not emit JSON lines: {line!r}")
    assert "finalize" in lines[-1]
    assert "get_working_document" in stdout


def test_cli_resume_continues_from_the_stored_checkpoint() -> None:
    calls: list[dict] = []
    checkpoint = {
        "phase": "running",
        "pendingActionId": None,
        "budget": {
            "turnsUsed": 1,
            "tokensUsed": 9,
            "costUsedUsd": 0.0,
            "maxTurns": 8,
            "maxTokens": 1000,
            "maxCostUsd": 1.0,
        },
        "messages": [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "go"},
            {"role": "tool", "content": "turn_9 checkpoint", "toolCallId": "c1", "name": "get_turn"},
        ],
    }

    def handler(request):
        path = request.url.path
        calls.append({"method": request.method, "path": path})
        if path == "/turns/turn_9" and request.method == "GET":
            return httpx.Response(200, json=turn_payload(id="turn_9"))
        if path == "/turns/turn_9/state" and request.method == "GET":
            return httpx.Response(200, json={"turnId": "turn_9", "runState": checkpoint, "stateVersion": 3})
        if path == "/turns/turn_9/state" and request.method == "PUT":
            return httpx.Response(200, json={"turnId": "turn_9", "runState": checkpoint, "stateVersion": 4})
        if path == "/turns/turn_9/finalize":
            return httpx.Response(200, json=turn_payload(id="turn_9", state="finalized", result=result_payload()))
        raise AssertionError(f"unexpected {request.method} {path}")

    provider = ScriptedProvider([done_response()])

    code, stdout, stderr = run_cli(
        ["--resume", "turn_9"],
        transport=httpx.MockTransport(handler),
        provider=provider,
    )

    assert code == 0, stderr
    # The restored context proves the state came from the checkpoint, not memory.
    assert provider.calls[0][-1].role == "tool"
    assert "turn_9 checkpoint" in provider.calls[0][-1].content
    events = json_events(stdout)
    assert events[-1]["type"] == "finalize"
    assert any(call["path"] == "/turns/turn_9/state" and call["method"] == "GET" for call in calls)


def test_cli_requires_a_model_when_it_must_build_the_provider() -> None:
    handler, _ = shortest_path_router()

    code, stdout, stderr = run_cli(
        ["--resume-id", "res_1", "--prompt", "tighten bullets"],
        transport=httpx.MockTransport(handler),
    )

    assert code == 2
    assert stdout == ""
    assert "--model" in stderr


def test_console_script_and_module_entrypoint_share_one_main() -> None:
    import resumate_agent_core.__main__ as module_entry

    assert module_entry.main is cli.main

    pyproject = Path(__file__).resolve().parents[1] / "pyproject.toml"
    project = tomllib.loads(pyproject.read_text(encoding="utf-8"))["project"]
    assert project["scripts"]["resumate-agent"] == "resumate_agent_core.cli:main"
