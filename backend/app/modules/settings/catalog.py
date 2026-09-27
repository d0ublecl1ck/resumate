"""Read-only model catalog sourced from a committed models.dev snapshot.

Providers and models are never hand-maintained in this repository:
scripts/refresh_model_catalog.py projects https://models.dev/api.json onto the
local snapshot under data/model_catalog.json, which is committed. Runtime reads
that file only, so catalog reads are fully offline and deterministic.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx

from app.shared.errors import ValidationFailed

SNAPSHOT_PATH = Path(__file__).resolve().parent / "data" / "model_catalog.json"
CATALOG_SOURCE = "models.dev"
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
PROBE_TIMEOUT_SECONDS = 5.0
CHAT_COMPLETIONS_PATH = "/chat/completions"


class ModelCatalogUnavailable(RuntimeError):
    """Raised when the committed catalog snapshot cannot be read."""


@dataclass(frozen=True, slots=True)
class CatalogModel:
    """One projected models.dev model entry."""

    id: str
    label: str
    context_window: int | None
    max_output_tokens: int | None
    input_cost_per_million: float | None
    output_cost_per_million: float | None


@dataclass(frozen=True, slots=True)
class CatalogProvider:
    """A models.dev provider together with its catalog models."""

    id: str
    label: str
    models: tuple[CatalogModel, ...]


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _as_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _read_snapshot(path: Path) -> tuple[CatalogProvider, ...]:
    """Parse the committed snapshot; any failure maps to ModelCatalogUnavailable."""
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ModelCatalogUnavailable(f"模型目录快照缺失：{path}") from exc
    except OSError as exc:  # pragma: no cover - defensive branch
        raise ModelCatalogUnavailable("模型目录快照无法读取") from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ModelCatalogUnavailable("模型目录快照不是合法 JSON") from exc
    providers_raw = data.get("providers") if isinstance(data, dict) else None
    if not isinstance(providers_raw, list):
        raise ModelCatalogUnavailable("模型目录快照缺少 providers")
    providers: list[CatalogProvider] = []
    for entry in providers_raw:
        if not isinstance(entry, dict):
            continue
        models_raw = entry.get("models")
        if not isinstance(models_raw, list):
            continue
        models = tuple(
            CatalogModel(
                id=str(model.get("id") or ""),
                label=str(model.get("label") or model.get("id") or ""),
                context_window=_as_int(model.get("contextWindow")),
                max_output_tokens=_as_int(model.get("maxOutputTokens")),
                input_cost_per_million=_as_float(model.get("inputCostPerMillion")),
                output_cost_per_million=_as_float(model.get("outputCostPerMillion")),
            )
            for model in models_raw
            if isinstance(model, dict) and (model.get("id") or model.get("label"))
        )
        providers.append(
            CatalogProvider(
                id=str(entry.get("id") or ""),
                label=str(entry.get("label") or entry.get("id") or ""),
                models=models,
            )
        )
    return tuple(providers)


@lru_cache(maxsize=1)
def _catalog_tree() -> tuple[CatalogProvider, ...]:
    return _read_snapshot(SNAPSHOT_PATH)


def list_catalog(*, provider: str | None = None, query: str | None = None) -> list[CatalogProvider]:
    """Return providers/models filtered by provider id and a model search.

    A provider survives only when it still has at least one matching model, so
    the response stays usable for the settings picker under a search query.
    """
    provider_filter = (provider or "").strip()
    needle = (query or "").strip().lower()
    result: list[CatalogProvider] = []
    for entry in _catalog_tree():
        if provider_filter and entry.id != provider_filter:
            continue
        models = [
            model
            for model in entry.models
            if not needle or needle in model.id.lower() or needle in model.label.lower()
        ]
        if not models:
            continue
        result.append(CatalogProvider(id=entry.id, label=entry.label, models=tuple(models)))
    return result


def _resolve_base_url(*, provider: str | None, api_base: str | None) -> str:
    """Configured endpoint, or the OpenAI default for the openai provider."""
    base = (api_base or "").strip().rstrip("/")
    if base:
        return base
    if (provider or "").strip().lower() == "openai":
        return DEFAULT_OPENAI_BASE_URL
    raise ValidationFailed("请先配置模型 Endpoint")


_STATUS_MESSAGES = {
    401: "模型服务拒绝凭证，请检查 API Key 与 provider 配置",
    403: "模型服务拒绝凭证，请检查 API Key 与 provider 配置",
    404: "模型不存在或不可用，请从模型目录重新选择",
    408: "模型服务超时，请稍后重试",
    429: "模型服务限流，请稍后重试",
}


def _safe_status_message(status: int) -> str:
    """Map an HTTP status to copy that never echoes the raw response or key."""
    if status in _STATUS_MESSAGES:
        return _STATUS_MESSAGES[status]
    if status >= 500:
        return "模型服务暂时不可用，请稍后重试"
    return f"模型连通性测试失败（HTTP {status}）"


def probe_connection(
    *,
    model: str,
    provider: str | None = None,
    api_key: str | None = None,
    api_base: str | None = None,
    timeout: float = PROBE_TIMEOUT_SECONDS,
    client: httpx.Client | None = None,
) -> tuple[bool, str]:
    """Probe an OpenAI-compatible /chat/completions endpoint.

    The caller is responsible for never putting the credential in the result;
    this function additionally maps every failure to a generic message so a
    provider error can never echo the key back to the client. An explicit
    client (for example an httpx.MockTransport client) is used for tests.
    """
    base_url = _resolve_base_url(provider=provider, api_base=api_base)
    url = base_url + CHAT_COMPLETIONS_PATH
    payload: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
    }
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    try:
        if client is None:
            with httpx.Client(timeout=timeout) as owned:
                response = owned.post(url, json=payload, headers=headers)
        else:
            response = client.post(url, json=payload, headers=headers)
    except httpx.HTTPError:
        return False, "无法连接模型服务，请检查 Endpoint 与网络"
    if response.status_code >= 400:
        return False, _safe_status_message(response.status_code)
    return True, "连接成功"
