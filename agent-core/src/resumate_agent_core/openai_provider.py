"""OpenAI-compatible ModelProvider built on httpx.

Works with any service exposing the OpenAI chat-completions protocol (OpenAI,
Azure OpenAI, OpenRouter, a local gateway, ...). The base package keeps httpx
as its only HTTP dependency: there is no vendor SDK and no per-provider model
list, because the model catalog is served by the backend.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

import httpx

from .runtime import Message, ModelResponse, ToolCall

DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
CHAT_COMPLETIONS_PATH = "/chat/completions"


class OpenAICompatibleError(RuntimeError):
    """Provider failure whose message never contains the API key."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def _as_int(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    return int(value)


def _as_float(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, Sequence) and not isinstance(content, (bytes, bytearray)):
        parts: list[str] = []
        for part in content:
            if isinstance(part, Mapping):
                parts.append(str(part.get("text") or ""))
            else:
                parts.append(str(getattr(part, "text", part)))
        return "".join(parts)
    return str(content)


def _parse_arguments(raw: Any) -> dict[str, Any]:
    if isinstance(raw, Mapping):
        return dict(raw)
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            return {}
        return dict(parsed) if isinstance(parsed, Mapping) else {}
    return {}


def _tool_calls(raw: Any) -> tuple[ToolCall, ...]:
    calls: list[ToolCall] = []
    for index, item in enumerate(raw or []):
        if not isinstance(item, Mapping):
            continue
        function = item.get("function")
        if not isinstance(function, Mapping):
            continue
        name = function.get("name")
        if not name:
            continue
        calls.append(
            ToolCall(
                id=str(item.get("id") or f"call_{index}"),
                name=str(name),
                arguments=_parse_arguments(function.get("arguments")),
            )
        )
    return tuple(calls)


def _message_to_wire(message: Message) -> dict[str, Any]:
    payload: dict[str, Any] = {"role": message.role, "content": message.content}
    if message.role == "assistant" and message.tool_calls:
        payload["tool_calls"] = [
            {
                "id": call.id,
                "type": "function",
                "function": {
                    "name": call.name,
                    "arguments": json.dumps(call.arguments or {}, ensure_ascii=False),
                },
            }
            for call in message.tool_calls
        ]
    if message.role == "tool":
        if message.tool_call_id:
            payload["tool_call_id"] = message.tool_call_id
        if message.name:
            payload["name"] = message.name
    return payload


def _tools_to_openai(tools: Sequence[Mapping[str, Any]] | None) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    for tool in tools or []:
        name = tool.get("name")
        if not name:
            continue
        specs.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": tool.get("description", ""),
                    "parameters": tool.get("input_schema") or {"type": "object", "properties": {}},
                },
            }
        )
    return specs


class OpenAICompatibleProvider:
    """ModelProvider backed by an OpenAI-compatible /chat/completions endpoint."""

    def __init__(
        self,
        *,
        model: str,
        api_key: str | None = None,
        base_url: str = DEFAULT_OPENAI_BASE_URL,
        timeout: float = 60.0,
        temperature: float | None = None,
        max_tokens: int | None = None,
        extra_headers: Mapping[str, str] | None = None,
        extra: Mapping[str, Any] | None = None,
        input_cost_per_million: float | None = None,
        output_cost_per_million: float | None = None,
        http_client: httpx.Client | None = None,
    ) -> None:
        model = (model or "").strip()
        if not model:
            raise ValueError("model must be a non-empty model id")
        self.model = model
        self._api_key = api_key
        self._base_url = (base_url or DEFAULT_OPENAI_BASE_URL).strip().rstrip("/")
        self._timeout = timeout
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._extra_headers = dict(extra_headers or {})
        self._extra = dict(extra or {})
        self._input_cost_per_million = input_cost_per_million
        self._output_cost_per_million = output_cost_per_million
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(timeout=timeout)

    def close(self) -> None:
        """Close the underlying httpx client when this provider owns it."""
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> "OpenAICompatibleProvider":
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.close()

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        headers.update(self._extra_headers)
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        return headers

    def _payload(
        self,
        messages: Sequence[Message],
        tools: Sequence[Mapping[str, Any]],
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [_message_to_wire(message) for message in messages],
        }
        if self._temperature is not None:
            payload["temperature"] = self._temperature
        if self._max_tokens is not None:
            payload["max_tokens"] = self._max_tokens
        specs = _tools_to_openai(tools)
        if specs:
            payload["tools"] = specs
        payload.update(self._extra)
        return payload

    def _cost(
        self,
        body: Mapping[str, Any],
        usage: Mapping[str, Any],
        input_tokens: int,
        output_tokens: int,
    ) -> float:
        """Best-effort cost: a gateway-reported cost, else optional unit prices."""
        for candidate in (usage.get("cost"), body.get("cost")):
            value = _as_float(candidate)
            if value is not None:
                return value
        if self._input_cost_per_million is None and self._output_cost_per_million is None:
            return 0.0
        return round(
            input_tokens / 1_000_000 * (self._input_cost_per_million or 0.0)
            + output_tokens / 1_000_000 * (self._output_cost_per_million or 0.0),
            6,
        )

    def _to_model_response(self, body: Any) -> ModelResponse:
        choices = body.get("choices") if isinstance(body, Mapping) else None
        if not isinstance(choices, list) or not choices:
            raise OpenAICompatibleError("model provider returned no choices")
        choice = choices[0] if isinstance(choices[0], Mapping) else {}
        message = choice.get("message")
        message = message if isinstance(message, Mapping) else {}
        usage = body.get("usage")
        usage = usage if isinstance(usage, Mapping) else {}
        input_tokens = _as_int(usage.get("prompt_tokens"))
        output_tokens = _as_int(usage.get("completion_tokens"))
        return ModelResponse(
            message=Message(
                role="assistant",
                content=_text(message.get("content")),
                tool_calls=_tool_calls(message.get("tool_calls")),
            ),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=self._cost(body, usage, input_tokens, output_tokens),
            stop_reason=choice.get("finish_reason"),
        )

    def complete(
        self,
        messages: Sequence[Message],
        tools: Sequence[Mapping[str, Any]],
    ) -> ModelResponse:
        """Return the next assistant message from the provider."""
        url = self._base_url + CHAT_COMPLETIONS_PATH
        try:
            response = self._client.post(url, json=self._payload(messages, tools), headers=self._headers())
        except httpx.HTTPError as exc:
            raise OpenAICompatibleError("model provider request failed") from exc
        if response.status_code >= 400:
            raise OpenAICompatibleError(
                f"model provider returned HTTP {response.status_code}",
                status_code=response.status_code,
            )
        try:
            body = response.json()
        except ValueError as exc:
            raise OpenAICompatibleError("model provider returned an invalid response") from exc
        return self._to_model_response(body)
