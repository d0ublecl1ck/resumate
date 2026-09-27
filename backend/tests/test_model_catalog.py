"""Model catalog snapshot parsing, filters, and the httpx connectivity probe."""

from __future__ import annotations

import json

import httpx
import pytest

from app.modules.settings import catalog
from app.shared.errors import ValidationFailed


def _mock_client(handler) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(handler))


def _snapshot_data() -> dict:
    return json.loads(catalog.SNAPSHOT_PATH.read_text(encoding="utf-8"))


def test_snapshot_has_the_models_dev_projection() -> None:
    data = _snapshot_data()

    assert data["source"] == "models.dev"
    assert data["providers"]

    provider = data["providers"][0]
    assert set(provider) == {"id", "label", "models"}
    model = provider["models"][0]
    assert set(model) <= {
        "id",
        "label",
        "contextWindow",
        "maxOutputTokens",
        "inputCostPerMillion",
        "outputCostPerMillion",
    }
    assert model["id"] and model["label"]


def test_list_catalog_filters_by_provider_and_query() -> None:
    openai_only = catalog.list_catalog(provider="openai")
    assert [entry.id for entry in openai_only] == ["openai"]
    assert openai_only[0].models

    needle = openai_only[0].models[0].id[:4].lower()
    matches = catalog.list_catalog(query=needle)
    assert matches
    for entry in matches:
        assert all(
            needle in f"{model.id} {model.label}".lower() for model in entry.models
        )

    assert catalog.list_catalog(provider="does-not-exist") == []


def test_missing_snapshot_reports_catalog_unavailable(tmp_path) -> None:
    with pytest.raises(catalog.ModelCatalogUnavailable):
        catalog._read_snapshot(tmp_path / "missing.json")


def test_malformed_snapshot_reports_catalog_unavailable(tmp_path) -> None:
    path = tmp_path / "model_catalog.json"
    path.write_text("{not json", encoding="utf-8")

    with pytest.raises(catalog.ModelCatalogUnavailable):
        catalog._read_snapshot(path)


def test_probe_defaults_to_openai_base_url_for_openai() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["authorization"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "pong"}}]})

    ok, message = catalog.probe_connection(
        model="gpt-4o-mini",
        provider="OpenAI",
        api_key="sk-secret",
        client=_mock_client(handler),
    )

    assert ok is True
    assert message == "连接成功"
    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["authorization"] == "Bearer sk-secret"
    assert captured["body"]["model"] == "gpt-4o-mini"
    assert captured["body"]["max_tokens"] == 1


def test_probe_uses_the_configured_endpoint() -> None:
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        return httpx.Response(200, json={})

    catalog.probe_connection(
        model="some-model",
        provider="custom",
        api_base="https://gateway.example/v1/",
        client=_mock_client(handler),
    )

    assert captured["url"] == "https://gateway.example/v1/chat/completions"


def test_probe_requires_endpoint_for_non_openai_provider() -> None:
    with pytest.raises(ValidationFailed):
        catalog.probe_connection(model="claude", provider="anthropic")


def test_probe_maps_http_failure_without_leaking_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": "bad key sk-super-secret"}})

    ok, message = catalog.probe_connection(
        model="gpt-4o-mini",
        provider="openai",
        api_key="sk-super-secret",
        client=_mock_client(handler),
    )

    assert ok is False
    assert "sk-super-secret" not in message
    assert "凭证" in message


def test_probe_maps_network_failure() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    ok, message = catalog.probe_connection(
        model="gpt-4o-mini",
        provider="openai",
        client=_mock_client(handler),
    )

    assert ok is False
    assert "无法连接" in message
