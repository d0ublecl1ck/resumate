"""LiteLLMProvider: response mapping and optional-dependency behavior."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from types import SimpleNamespace

import pytest

from resumate_agent_core import Message, ModelProvider, ModelResponse, ToolCall
from resumate_agent_core.litellm_provider import (
    LITELLM_LOCAL_COST_MAP_ENV,
    LiteLLMProvider,
    LiteLLMUnavailableError,
    import_litellm,
)


def _fake_response() -> SimpleNamespace:
    function = SimpleNamespace(name="create_turn", arguments='{"resume_id": "res_1"}')
    tool_call = SimpleNamespace(id="call_1", function=function)
    message = SimpleNamespace(content="working", tool_calls=[tool_call])
    choice = SimpleNamespace(message=message, finish_reason="tool_calls")
    usage = SimpleNamespace(prompt_tokens=12, completion_tokens=7)
    return SimpleNamespace(choices=[choice], usage=usage, _hidden_params={"response_cost": 0.0031})


def test_provider_maps_messages_tools_and_response(monkeypatch):
    provider = LiteLLMProvider(
        model="gpt-4o-mini",
        provider="openai",
        api_key="sk-secret",
        api_base="https://api.example.com/v1",
        temperature=0.2,
        max_tokens=100,
    )
    captured: dict = {}

    def fake_completion(**kwargs):
        captured.update(kwargs)
        return _fake_response()

    monkeypatch.setattr(provider._litellm, "completion", fake_completion)

    messages = [
        Message(role="system", content="system prompt"),
        Message(role="user", content="do it"),
        Message(
            role="assistant",
            content="",
            tool_calls=(ToolCall(id="call_0", name="preview_patch", arguments={"ops": []}),),
        ),
        Message(role="tool", content="ok", tool_call_id="call_0", name="preview_patch"),
    ]
    tools = [
        {
            "name": "create_turn",
            "description": "open a turn",
            "input_schema": {"type": "object", "properties": {"resume_id": {"type": "string"}}},
        }
    ]

    result = provider.complete(messages, tools)

    assert captured["model"] == "gpt-4o-mini"
    assert captured["custom_llm_provider"] == "openai"
    assert captured["api_key"] == "sk-secret"
    assert captured["api_base"] == "https://api.example.com/v1"
    assert captured["temperature"] == 0.2
    assert captured["max_tokens"] == 100
    assert captured["messages"][0] == {"role": "system", "content": "system prompt"}
    assistant = captured["messages"][2]
    assert assistant["tool_calls"][0]["function"]["name"] == "preview_patch"
    assert json.loads(assistant["tool_calls"][0]["function"]["arguments"]) == {"ops": []}
    assert captured["messages"][3]["tool_call_id"] == "call_0"
    assert captured["tools"][0]["type"] == "function"
    assert captured["tools"][0]["function"]["parameters"]["type"] == "object"

    assert isinstance(result, ModelResponse)
    assert result.message.role == "assistant"
    assert result.message.content == "working"
    assert result.message.tool_calls[0].name == "create_turn"
    assert result.message.tool_calls[0].arguments == {"resume_id": "res_1"}
    assert result.input_tokens == 12
    assert result.output_tokens == 7
    assert result.cost_usd == pytest.approx(0.0031)
    assert result.stop_reason == "tool_calls"


def test_provider_falls_back_to_completion_cost(monkeypatch):
    provider = LiteLLMProvider(model="gpt-4o-mini")
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content="hi", tool_calls=None),
                finish_reason="stop",
            )
        ],
        usage=None,
    )
    monkeypatch.setattr(provider._litellm, "completion", lambda **kwargs: response)
    monkeypatch.setattr(provider._litellm, "completion_cost", lambda completion_response: 0.5)

    result = provider.complete([Message(role="user", content="hi")], [])

    assert result.input_tokens == 0
    assert result.output_tokens == 0
    assert result.cost_usd == pytest.approx(0.5)
    assert "tools" not in provider._base_kwargs()


def test_provider_treats_invalid_tool_arguments_as_empty(monkeypatch):
    provider = LiteLLMProvider(model="gpt-4o-mini")
    response = SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(
                    content="",
                    tool_calls=[SimpleNamespace(id="c", function=SimpleNamespace(name="x", arguments="not-json"))],
                ),
                finish_reason=None,
            )
        ],
        usage=None,
    )
    monkeypatch.setattr(provider._litellm, "completion", lambda **kwargs: response)

    result = provider.complete([], [])

    assert result.message.tool_calls[0].arguments == {}


def test_provider_satisfies_model_provider_protocol():
    provider = LiteLLMProvider(model="gpt-4o-mini")
    assert isinstance(provider, ModelProvider)


def test_provider_rejects_blank_model():
    with pytest.raises(ValueError):
        LiteLLMProvider(model="   ")


def test_import_litellm_defaults_to_local_cost_map(monkeypatch):
    monkeypatch.delenv(LITELLM_LOCAL_COST_MAP_ENV, raising=False)

    module = import_litellm()

    assert module.__name__ == "litellm"
    assert os.environ[LITELLM_LOCAL_COST_MAP_ENV] == "True"


def test_provider_without_litellm_raises_clear_error(monkeypatch):
    monkeypatch.setitem(sys.modules, "litellm", None)

    with pytest.raises(LiteLLMUnavailableError) as error:
        LiteLLMProvider(model="gpt-4o-mini")

    message = str(error.value)
    assert "litellm" in message
    assert "uv add litellm" in message


def test_package_import_survives_absent_litellm():
    code = (
        "import sys; sys.modules['litellm'] = None; "
        "import resumate_agent_core; "
        "from resumate_agent_core import LiteLLMProvider; "
        "print('ok')"
    )

    completed = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)

    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == "ok"
