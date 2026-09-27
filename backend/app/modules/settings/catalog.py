"""Read-only model catalog sourced from litellm.

Providers and models are never hand-maintained in this repository: they come
from litellm's own model_prices_and_context_window.json, which ships with the
installed litellm package. litellm is imported lazily so importing the settings
module (and therefore the app) stays fast, and the bundled cost map is used so
serving the catalog never reaches the network.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

PROBE_TIMEOUT_SECONDS = 5
# Use the cost map bundled with the installed litellm instead of fetching it
# from GitHub, keeping catalog reads deterministic and offline. An explicit
# operator override is preserved.
LITELLM_LOCAL_COST_MAP_ENV = "LITELLM_LOCAL_MODEL_COST_MAP"


class ModelCatalogUnavailable(RuntimeError):
    """Raised when the litellm catalog source cannot be imported."""


@lru_cache(maxsize=1)
def _litellm() -> Any:
    os.environ.setdefault(LITELLM_LOCAL_COST_MAP_ENV, "True")
    try:
        import litellm
    except ImportError as exc:  # pragma: no cover - litellm is a declared dependency
        raise ModelCatalogUnavailable("模型目录依赖 litellm，请先安装后端依赖") from exc
    return litellm


@dataclass(frozen=True, slots=True)
class CatalogModel:
    """One provider-scoped model entry from the litellm catalog."""

    id: str
    label: str
    context_window: int | None
    max_output_tokens: int | None
    input_cost_per_million: float | None
    output_cost_per_million: float | None


@dataclass(frozen=True, slots=True)
class CatalogProvider:
    """A litellm provider together with its catalog models."""

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


def _per_million(value: Any) -> float | None:
    per_token = _as_float(value)
    if per_token is None:
        return None
    return round(per_token * 1_000_000, 6)


@lru_cache(maxsize=1)
def _catalog_tree() -> tuple[CatalogProvider, ...]:
    """Build the provider/model tree once from litellm's maintained catalog."""
    litellm = _litellm()
    grouped: dict[str, list[CatalogModel]] = {}
    for model_id, info in litellm.model_cost.items():
        if not isinstance(info, dict):
            continue
        provider = info.get("litellm_provider")
        if not isinstance(provider, str) or not provider:
            continue
        grouped.setdefault(provider, []).append(
            CatalogModel(
                id=str(model_id),
                # litellm has no separate display name, so its id is the label.
                label=str(model_id),
                context_window=_as_int(info.get("max_input_tokens")),
                max_output_tokens=_as_int(info.get("max_output_tokens")),
                input_cost_per_million=_per_million(info.get("input_cost_per_token")),
                output_cost_per_million=_per_million(info.get("output_cost_per_token")),
            )
        )
    return tuple(
        CatalogProvider(
            id=provider_id,
            label=provider_id,
            models=tuple(sorted(models, key=lambda item: item.id)),
        )
        for provider_id, models in sorted(grouped.items())
    )


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
        models = [model for model in entry.models if not needle or needle in model.id.lower()]
        if not models:
            continue
        result.append(CatalogProvider(id=entry.id, label=entry.label, models=tuple(models)))
    return result


_STATUS_MESSAGES = {
    401: "模型服务拒绝凭证，请检查 API Key 与 provider 配置",
    403: "模型服务拒绝凭证，请检查 API Key 与 provider 配置",
    404: "模型不存在或不可用，请从模型目录重新选择",
    408: "模型服务超时，请稍后重试",
    429: "模型服务限流，请稍后重试",
}


def _safe_error_message(exc: Exception) -> str:
    """Map a litellm failure to a message that never echoes the raw error/key."""
    status = getattr(exc, "status_code", None)
    if isinstance(status, int):
        if status in _STATUS_MESSAGES:
            return _STATUS_MESSAGES[status]
        if status >= 500:
            return "模型服务暂时不可用，请稍后重试"
        return f"模型连通性测试失败（HTTP {status}）"
    return f"模型连通性测试失败（{type(exc).__name__}）"


def probe_connection(
    *,
    model: str,
    provider: str | None = None,
    api_key: str | None = None,
    api_base: str | None = None,
    timeout: float = PROBE_TIMEOUT_SECONDS,
) -> tuple[bool, str]:
    """Run a minimal litellm call as a connectivity/credential check.

    The caller is responsible for never putting the credential in the result;
    this function additionally maps every failure to a generic message so a
    provider error can never echo the key back to the client.
    """
    litellm = _litellm()
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 1,
        "timeout": timeout,
    }
    if provider:
        kwargs["custom_llm_provider"] = provider
    if api_key:
        kwargs["api_key"] = api_key
    if api_base:
        kwargs["api_base"] = api_base
    try:
        litellm.completion(**kwargs)
    except Exception as exc:  # noqa: BLE001 - deliberately mapped to a safe message
        return False, _safe_error_message(exc)
    return True, "连接成功"
