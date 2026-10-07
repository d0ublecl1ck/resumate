"""Read-only model catalog sourced from a committed models.dev snapshot.

Providers and models are never hand-maintained in this repository:
scripts/refresh_model_catalog.py projects https://models.dev/api.json onto the
local snapshot under data/model_catalog.json, which is committed. Runtime reads
that file only, so catalog reads are fully offline and deterministic.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx

from app.shared.errors import ValidationFailed

logger = logging.getLogger(__name__)

SNAPSHOT_PATH = Path(__file__).resolve().parent / "data" / "model_catalog.json"
CATALOG_SOURCE = "models.dev"
# Providers the settings picker exposes (issue 7aa58). Everything else in the
# snapshot stays on disk but is reachable only through the custom entry, where
# the user types provider/model/endpoint by hand. Order here is the order the
# picker shows, so adding or removing a provider is a one-line change.
ALLOWED_PROVIDER_IDS = (
    "deepseek",
    "openai",
    "anthropic",
    "zhipuai",
    "zhipuai-coding-plan",
)
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
# Split probe budget (issue 2f744): connect/pool stay short so an unreachable
# endpoint fails fast, while read is relaxed for reasoning models whose first
# token can take well over the old 5s whole-request cap.
PROBE_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
CHAT_COMPLETIONS_PATH = "/chat/completions"
_PROBE_CONNECT_FAILURE_MESSAGE = "无法连接模型服务，请检查 Endpoint 与网络"
_PROBE_TIMEOUT_MESSAGE = "模型响应超时，请稍后重试"


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

    Only ALLOWED_PROVIDER_IDS are visible: an id outside the whitelist matches
    nothing, so a caller asking for a hidden provider gets an empty list rather
    than a peek at the rest of the snapshot. Results follow the whitelist order
    instead of the snapshot order, so the settings picker is stable no matter how
    models.dev sorts its file. A provider survives only when it still has at least
    one matching model, so the response stays usable under a search query.
    """
    provider_filter = (provider or "").strip()
    needle = (query or "").strip().lower()
    tree = _catalog_tree()
    by_id = {entry.id: entry for entry in tree}
    result: list[CatalogProvider] = []
    for entry_id in ALLOWED_PROVIDER_IDS:
        if provider_filter and entry_id != provider_filter:
            continue
        entry = by_id.get(entry_id)
        if entry is None:
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
    timeout: httpx.Timeout | float = PROBE_TIMEOUT,
    client: httpx.Client | None = None,
) -> tuple[bool, str]:
    """Probe an OpenAI-compatible /chat/completions endpoint.

    The caller is responsible for never putting the credential in the result;
    this function additionally maps every failure to a generic message so a
    provider error can never echo the key back to the client. An explicit
    client (for example an httpx.MockTransport client) is used for tests.

    Transport failures are classified: a connect failure and a response timeout
    read differently, and each one logs only the probe url and exception type —
    never the credential, headers, or request body.
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
    except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
        logger.warning("模型探测无法连接：url=%s error=%s", url, type(exc).__name__)
        return False, _PROBE_CONNECT_FAILURE_MESSAGE
    except httpx.TimeoutException as exc:
        logger.warning("模型探测响应超时：url=%s error=%s", url, type(exc).__name__)
        return False, _PROBE_TIMEOUT_MESSAGE
    except httpx.HTTPError as exc:
        logger.warning("模型探测传输层异常：url=%s error=%s", url, type(exc).__name__)
        return False, _PROBE_CONNECT_FAILURE_MESSAGE
    if response.status_code >= 400:
        return False, _safe_status_message(response.status_code)
    return True, "连接成功"
