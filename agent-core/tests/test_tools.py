"""Tool registry shape and dispatch."""

from __future__ import annotations

import json

import httpx
import pytest

from conftest import BASE, capability_payload, turn_payload
from resumate_agent_core.tools import (
    TOOLS,
    ToolArgumentError,
    UnknownToolError,
    call_tool,
    get_tool,
    list_tools,
    openai_tool_specs,
    tool_specs,
)

EXPECTED = {
    "capability",
    "create_turn",
    "get_turn",
    "finalize_turn",
    "cancel_turn",
    "validate_patch",
    "preview_patch",
    "apply_patch",
    "list_pending_actions",
    "get_working_document",
}


def test_registry_covers_every_endpoint_tool():
    assert set(TOOLS) == EXPECTED
    assert len(list_tools()) == len(EXPECTED)


def test_human_approval_is_not_exposed_as_a_model_tool():
    """批准与拒绝是用户动作，不能成为模型可调用的工具。"""
    assert "approve_action" not in TOOLS
    assert "reject_action" not in TOOLS
    with pytest.raises(UnknownToolError):
        get_tool("approve_action")
    with pytest.raises(UnknownToolError):
        get_tool("reject_action")


def test_every_spec_is_json_serializable_with_object_schema():
    specs = tool_specs()
    assert len(specs) == len(EXPECTED)
    for spec in specs:
        assert spec["name"] in EXPECTED
        assert spec["description"]
        schema = spec["input_schema"]
        assert schema["type"] == "object"
        assert isinstance(schema["properties"], dict)
    json.dumps(specs)


def test_openai_specs_wrap_parameters():
    specs = openai_tool_specs()
    for spec in specs:
        assert spec["type"] == "function"
        assert spec["function"]["name"] in EXPECTED
        assert spec["function"]["parameters"]["type"] == "object"


def test_call_tool_dispatches_to_the_client(make_client):
    def handler(request):
        assert request.url.path == "/.well-known/resume-agent"
        assert request.headers["cookie"] == "resumate_session=sess-1"
        return httpx.Response(200, json=capability_payload())

    with make_client(handler) as client:
        result = call_tool(client, "capability")
    assert result["contractVersion"] == "1.0"
    assert "agent.turns" in result["capabilities"]


def test_unknown_tool_raises():
    with pytest.raises(UnknownToolError) as error:
        get_tool("does_not_exist")
    assert "known tools" in str(error.value)


def test_missing_argument_raises(make_client):
    def handler(request):  # pragma: no cover - must not be reached
        raise AssertionError("tool should fail before any HTTP call")

    with make_client(handler) as client:
        with pytest.raises(ToolArgumentError):
            call_tool(client, "get_turn", {})


def test_turn_scoped_schema_declares_required_turn_id():
    schema = TOOLS["preview_patch"].input_schema
    assert schema["required"] == ["turn_id", "ops"]
    assert schema["properties"]["ops"]["minItems"] == 1


def test_resume_scoped_schemas_leave_resume_id_to_the_runtime():
    """resume_id 由运行体注入：模型即使省略也必须能调用，schema 不标 required。"""
    for name in ("create_turn", "get_working_document"):
        schema = TOOLS[name].input_schema
        assert "resume_id" in schema["properties"]
        assert "resume_id" not in schema["required"]


def test_resume_create_turn_accepts_the_session():
    """运行体自建轮次也必须挂会话；session_id 由运行时注入，所以列入 required。"""
    schema = TOOLS["create_turn"].input_schema
    assert "session_id" in schema["properties"]
    assert "session_id" in schema["required"]


def test_create_turn_tool_passes_the_session_id(make_client):
    seen: dict[str, object] = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return httpx.Response(201, json=turn_payload())

    with make_client(handler) as client:
        call_tool(client, "create_turn", {"resume_id": "res_1", "session_id": "sess_x"})

    assert seen["body"]["sessionId"] == "sess_x"
