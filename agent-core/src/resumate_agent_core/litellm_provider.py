"""LiteLLM-backed ModelProvider implementation (optional dependency).

litellm is optional and lazily imported: importing resumate_agent_core never
imports it, so every other ModelProvider keeps working when litellm is absent.
A LiteLLMUnavailableError with install guidance is raised only when
LiteLLMProvider is constructed.

The provider adapts the runtime's neutral Message/ToolCall shape to and from
litellm's chat-completions response. litellm loads its model cost map at import,
so this module defaults that load to the map bundled with the installed package
and never reaches the network just to build a provider.
"""

from __future__ import annotations

import json
import os
from collections.abc import Mapping, Sequence
from typing import Any

from .runtime import Message, ModelResponse, ToolCall

LITELLM_LOCAL_COST_MAP_ENV = "LITELLM_LOCAL_MODEL_COST_MAP"
_INSTALL_HINT = (
    "LiteLLMProvider requires the optional 'litellm' package; install it with "
    "uv add litellm or pip install 'resumate-agent-core[litellm]'."
)


class LiteLLMUnavailableError(RuntimeError):
    """Raised when LiteLLMProvider is used without litellm installed."""


def import_litellm() -> Any:
    """Import litellm on first use, mapping a missing package to a clear error."""
    os.environ.setdefault(LITELLM_LOCAL_COST_MAP_ENV, "True")
    try:
        import litellm
    except ImportError as exc:
        raise LiteLLMUnavailableError(_INSTALL_HINT) from exc
    return litellm


def _get(obj: Any, key: str, default: Any = None) -> Any:
    """Read key from a mapping or an attribute-style object."""
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _parse_arguments(raw: Any) -> dict[str, Any]:
    """Normalize tool arguments: litellm sends a JSON string, tests may send dicts."""
    if isinstance(raw, Mapping):
        return dict(raw)
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except (TypeError, ValueError):
            return {}
        return dict(parsed) if isinstance(parsed, Mapping) else {}
    return {}


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


def _tool_calls(raw: Any) -> tuple[ToolCall, ...]:
    calls: list[ToolCall] = []
    for index, item in enumerate(raw or []):
        function = _get(item, "function")
        name = _get(function, "name")
        if not name:
            continue
        call_id = _get(item, "id") or f"call_{index}"
        calls.append(
            ToolCall(
                id=str(call_id),
                name=str(name),
                arguments=_parse_arguments(_get(function, "arguments")),
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


def _extract_cost(litellm: Any, response: Any) -> float:
    hidden = getattr(response, "_hidden_params", None)
    if isinstance(hidden, Mapping):
        value = hidden.get("response_cost")
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                pass
    try:
        return float(litellm.completion_cost(completion_response=response) or 0.0)
    except Exception:  # noqa: BLE001 - cost is best-effort accounting
        return 0.0


def _to_model_response(litellm: Any, response: Any) -> ModelResponse:
    choices = getattr(response, "choices", None) or []
    if not choices:
        raise RuntimeError("litellm returned no choices")
    choice = choices[0]
    message = getattr(choice, "message", None)
    usage = getattr(response, "usage", None)
    input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0) if usage is not None else 0
    output_tokens = int(getattr(usage, "completion_tokens", 0) or 0) if usage is not None else 0
    return ModelResponse(
        message=Message(
            role="assistant",
            content=_text(getattr(message, "content", "")),
            tool_calls=_tool_calls(getattr(message, "tool_calls", None)),
        ),
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=_extract_cost(litellm, response),
        stop_reason=getattr(choice, "finish_reason", None),
    )


class LiteLLMProvider:
    """ModelProvider backed by litellm's unified chat-completions API."""

    def __init__(
        self,
        *,
        model: str,
        api_key: str | None = None,
        api_base: str | None = None,
        provider: str | None = None,
        timeout: float = 60.0,
        temperature: float | None = None,
        max_tokens: int | None = None,
        extra: Mapping[str, Any] | None = None,
    ) -> None:
        model = (model or "").strip()
        if not model:
            raise ValueError("model must be a non-empty litellm model id")
        self._litellm = import_litellm()
        self.model = model
        self.provider = (provider or "").strip() or None
        self._api_key = api_key
        self._api_base = (api_base or "").strip() or None
        self._timeout = timeout
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._extra = dict(extra or {})

    def _base_kwargs(self) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"model": self.model, "timeout": self._timeout}
        if self.provider:
            kwargs["custom_llm_provider"] = self.provider
        if self._api_key:
            kwargs["api_key"] = self._api_key
        if self._api_base:
            kwargs["api_base"] = self._api_base
        if self._temperature is not None:
            kwargs["temperature"] = self._temperature
        if self._max_tokens is not None:
            kwargs["max_tokens"] = self._max_tokens
        merged = dict(self._extra)
        merged.update(kwargs)
        return merged

    def complete(
        self,
        messages: Sequence[Message],
        tools: Sequence[Mapping[str, Any]],
    ) -> ModelResponse:
        """Return the next assistant message from litellm."""
        kwargs = self._base_kwargs()
        kwargs["messages"] = [_message_to_wire(message) for message in messages]
        specs = _tools_to_openai(tools)
        if specs:
            kwargs["tools"] = specs
        response = self._litellm.completion(**kwargs)
        return _to_model_response(self._litellm, response)
