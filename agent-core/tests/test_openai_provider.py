"""OpenAICompatibleProvider: request mapping, response parsing, error safety."""

from __future__ import annotations

import json

import httpx
import pytest

from resumate_agent_core import Message, ModelProvider, ModelResponse, ToolCall
from resumate_agent_core.openai_provider import (
    DEFAULT_OPENAI_BASE_URL,
    OpenAICompatibleError,
    OpenAICompatibleProvider,
)


def _mock_client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def _response_body() -> dict:
    return {
        "choices": [
            {
                "message": {
                    "content": "working",
                    "tool_calls": [
                        {
                            "id": "call_1",
                            "type": "function",
                            "function": {
                                "name": "create_turn",
                                "arguments": '{"resume_id": "res_1"}',
                            },
                        }
                    ],
                },
                "finish_reason": "tool_calls",
            }
        ],
        "usage": {"prompt_tokens": 12, "completion_tokens": 7},
    }


def test_provider_maps_request_and_response() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers.get("authorization")
        captured["content_type"] = request.headers.get("content-type")
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json=_response_body())

    provider = OpenAICompatibleProvider(
        model="gpt-4o-mini",
        api_key="sk-secret",
        base_url="https://api.example.com/v1",
        temperature=0.2,
        max_tokens=100,
        http_client=_mock_client(handler),
    )
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

    assert captured["url"] == "https://api.example.com/v1/chat/completions"
    assert captured["authorization"] == "Bearer sk-secret"
    assert captured["content_type"] == "application/json"
    body = captured["body"]
    assert body["model"] == "gpt-4o-mini"
    assert body["temperature"] == 0.2
    assert body["max_tokens"] == 100
    assert body["messages"][0] == {"role": "system", "content": "system prompt"}
    assistant = body["messages"][2]
    assert assistant["tool_calls"][0]["function"]["name"] == "preview_patch"
    assert json.loads(assistant["tool_calls"][0]["function"]["arguments"]) == {"ops": []}
    assert body["messages"][3]["tool_call_id"] == "call_0"
    assert body["tools"][0]["type"] == "function"
    assert body["tools"][0]["function"]["parameters"]["type"] == "object"

    assert isinstance(result, ModelResponse)
    assert result.message.role == "assistant"
    assert result.message.content == "working"
    assert result.message.tool_calls[0].name == "create_turn"
    assert result.message.tool_calls[0].arguments == {"resume_id": "res_1"}
    assert result.input_tokens == 12
    assert result.output_tokens == 7
    assert result.cost_usd == 0.0
    assert result.stop_reason == "tool_calls"


def test_provider_defaults_to_the_openai_base_url() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(200, json=_response_body())

    with OpenAICompatibleProvider(model="gpt-4o-mini", http_client=_mock_client(handler)) as provider:
        provider.complete([Message(role="user", content="hi")], [])

    assert captured["url"] == DEFAULT_OPENAI_BASE_URL + "/chat/completions"


def test_provider_computes_cost_from_unit_prices() -> None:
    provider = OpenAICompatibleProvider(
        model="gpt-4o-mini",
        input_cost_per_million=0.15,
        output_cost_per_million=0.6,
        http_client=_mock_client(lambda request: httpx.Response(200, json=_response_body())),
    )

    result = provider.complete([Message(role="user", content="hi")], [])

    # 12 input tokens at 0.15/M plus 7 output tokens at 0.6/M.
    assert result.cost_usd == pytest.approx(12 / 1_000_000 * 0.15 + 7 / 1_000_000 * 0.6)


def test_provider_prefers_gateway_reported_cost() -> None:
    body = _response_body()
    body["usage"]["cost"] = 0.0042
    provider = OpenAICompatibleProvider(
        model="gpt-4o-mini",
        http_client=_mock_client(lambda request: httpx.Response(200, json=body)),
    )

    result = provider.complete([Message(role="user", content="hi")], [])

    assert result.cost_usd == pytest.approx(0.0042)


def test_provider_raises_on_http_error_without_leaking_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "bad key sk-super-secret"}})

    provider = OpenAICompatibleProvider(
        model="gpt-4o-mini",
        api_key="sk-super-secret",
        http_client=_mock_client(handler),
    )

    with pytest.raises(OpenAICompatibleError) as error:
        provider.complete([Message(role="user", content="hi")], [])

    assert error.value.status_code == 401
    assert "sk-super-secret" not in str(error.value)


def test_provider_raises_on_network_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    provider = OpenAICompatibleProvider(model="gpt-4o-mini", http_client=_mock_client(handler))

    with pytest.raises(OpenAICompatibleError):
        provider.complete([Message(role="user", content="hi")], [])


def test_provider_raises_on_invalid_json() -> None:
    provider = OpenAICompatibleProvider(
        model="gpt-4o-mini",
        http_client=_mock_client(
            lambda request: httpx.Response(200, text="not json", headers={"content-type": "text/plain"})
        ),
    )

    with pytest.raises(OpenAICompatibleError):
        provider.complete([Message(role="user", content="hi")], [])


def test_provider_raises_when_no_choices() -> None:
    provider = OpenAICompatibleProvider(
        model="gpt-4o-mini",
        http_client=_mock_client(lambda request: httpx.Response(200, json={"choices": []})),
    )

    with pytest.raises(OpenAICompatibleError):
        provider.complete([Message(role="user", content="hi")], [])


def test_invalid_tool_arguments_become_empty_dict() -> None:
    body = {
        "choices": [
            {
                "message": {
                    "content": "",
                    "tool_calls": [{"id": "c", "function": {"name": "x", "arguments": "not-json"}}],
                },
                "finish_reason": None,
            }
        ]
    }
    provider = OpenAICompatibleProvider(
        model="gpt-4o-mini",
        http_client=_mock_client(lambda request: httpx.Response(200, json=body)),
    )

    result = provider.complete([], [])

    assert result.message.tool_calls[0].arguments == {}


def test_provider_merges_extra_headers_and_payload() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["header"] = request.headers.get("x-tenant")
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json=_response_body())

    provider = OpenAICompatibleProvider(
        model="gpt-4o-mini",
        extra_headers={"X-Tenant": "team-a"},
        extra={"top_p": 0.9},
        http_client=_mock_client(handler),
    )

    provider.complete([Message(role="user", content="hi")], [])

    assert captured["header"] == "team-a"
    assert captured["body"]["top_p"] == 0.9


def test_provider_rejects_blank_model() -> None:
    with pytest.raises(ValueError):
        OpenAICompatibleProvider(model="   ")


def test_provider_satisfies_model_provider_protocol() -> None:
    provider = OpenAICompatibleProvider(
        model="gpt-4o-mini",
        http_client=_mock_client(lambda request: httpx.Response(200, json=_response_body())),
    )
    assert isinstance(provider, ModelProvider)


def test_close_does_not_close_an_injected_client() -> None:
    http_client = _mock_client(lambda request: httpx.Response(200, json=_response_body()))
    provider = OpenAICompatibleProvider(model="gpt-4o-mini", http_client=http_client)

    provider.close()

    assert http_client.is_closed is False
    http_client.close()

def test_provider_passes_reasoning_content_back_to_thinking_models() -> None:
    """DeepSeek 思考模式要求回传 reasoning_content，丢掉字段下一次请求直接 400。"""
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "先想一下",
                            "reasoning_content": "内部推理",
                        }
                    }
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            },
        )

    provider = OpenAICompatibleProvider(model="deepseek-flash", http_client=_mock_client(handler))
    first = provider.complete([Message(role="user", content="hi")], [])
    assert first.message.reasoning == "内部推理"

    provider.complete([Message(role="user", content="hi"), first.message], [])

    replayed = seen[-1]["messages"][1]
    assert replayed["reasoning_content"] == "内部推理"
    assert replayed["content"] == "先想一下"

