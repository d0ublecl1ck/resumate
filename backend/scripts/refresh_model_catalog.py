#!/usr/bin/env python3
"""Refresh the committed models.dev model-catalog snapshot.

The repository never hand-maintains provider/model lists. This developer tool
fetches the open models.dev catalog and projects it to the compact snapshot
that app/modules/settings/catalog.py reads at runtime:

    uv run --directory backend python scripts/refresh_model_catalog.py

Run it when upstream changes, review the diff, and commit the snapshot.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import httpx

DEFAULT_SOURCE_URL = "https://models.dev/api.json"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "app/modules/settings/data/model_catalog.json"
SOURCE_NAME = "models.dev"
FETCH_TIMEOUT_SECONDS = 60.0


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


def project(upstream: dict[str, Any]) -> dict[str, Any]:
    """Project models.dev api.json onto the compact committed snapshot."""
    providers: list[dict[str, Any]] = []
    for provider_key, provider in sorted(upstream.items()):
        if not isinstance(provider, dict):
            continue
        models_source = provider.get("models")
        if not isinstance(models_source, dict):
            continue
        models: list[dict[str, Any]] = []
        for model_key, model in sorted(models_source.items()):
            if not isinstance(model, dict):
                continue
            limit = model.get("limit") if isinstance(model.get("limit"), dict) else {}
            cost = model.get("cost") if isinstance(model.get("cost"), dict) else {}
            models.append(
                {
                    "id": str(model.get("id") or model_key),
                    "label": str(model.get("name") or model.get("id") or model_key),
                    "contextWindow": _as_int(limit.get("context")),
                    "maxOutputTokens": _as_int(limit.get("output")),
                    "inputCostPerMillion": _as_float(cost.get("input")),
                    "outputCostPerMillion": _as_float(cost.get("output")),
                }
            )
        providers.append(
            {
                "id": str(provider.get("id") or provider_key),
                "label": str(provider.get("name") or provider.get("id") or provider_key),
                "models": models,
            }
        )
    return {"source": SOURCE_NAME, "providers": providers}


def fetch(url: str) -> dict[str, Any]:
    with httpx.Client(timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()
        data = response.json()
    if not isinstance(data, dict):
        raise SystemExit("upstream catalog is not a JSON object")
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    snapshot = project(fetch(args.source_url))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    model_count = sum(len(provider["models"]) for provider in snapshot["providers"])
    print(f"wrote {args.output} ({len(snapshot['providers'])} providers, {model_count} models)")


if __name__ == "__main__":
    main()
