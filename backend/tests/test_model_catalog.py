"""Model catalog snapshot parsing, filters, and the httpx connectivity probe."""

from __future__ import annotations

import json
import logging

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


def _raising_client(exc: Exception) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        raise exc

    return _mock_client(handler)


@pytest.mark.parametrize(
    "exc",
    [
        httpx.ReadTimeout("read timed out"),
        httpx.WriteTimeout("write timed out"),
        httpx.PoolTimeout("pool timed out"),
    ],
)
def test_probe_maps_response_timeout_to_timeout_message(exc: Exception) -> None:
    ok, message = catalog.probe_connection(
        model="gpt-4o-mini",
        provider="openai",
        client=_raising_client(exc),
    )

    assert ok is False
    assert message == "模型响应超时，请稍后重试"
    assert "无法连接" not in message


@pytest.mark.parametrize(
    "exc",
    [
        httpx.ConnectError("no route"),
        httpx.ConnectTimeout("connect timed out"),
    ],
)
def test_probe_keeps_network_message_for_connect_failures(exc: Exception) -> None:
    ok, message = catalog.probe_connection(
        model="gpt-4o-mini",
        provider="openai",
        client=_raising_client(exc),
    )

    assert ok is False
    assert message == "无法连接模型服务，请检查 Endpoint 与网络"


def test_probe_distinguishes_connect_error_from_read_timeout() -> None:
    _, connect_message = catalog.probe_connection(
        model="gpt-4o-mini",
        provider="openai",
        client=_raising_client(httpx.ConnectError("no route")),
    )
    _, timeout_message = catalog.probe_connection(
        model="gpt-4o-mini",
        provider="openai",
        client=_raising_client(httpx.ReadTimeout("read timed out")),
    )

    assert connect_message != timeout_message


def test_probe_logs_transport_failure_without_leaking_credentials(caplog) -> None:
    caplog.set_level(logging.WARNING, logger=catalog.__name__)
    api_key = "sk-super-secret"

    ok, _ = catalog.probe_connection(
        model="gpt-4o-mini",
        provider="openai",
        api_key=api_key,
        client=_raising_client(httpx.ReadTimeout("read timed out")),
    )

    assert ok is False
    assert caplog.records
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "https://api.openai.com/v1/chat/completions" in logged
    assert "ReadTimeout" in logged
    assert api_key not in logged
    assert "Authorization" not in logged


def test_probe_default_timeout_is_split_with_relaxed_read() -> None:
    timeout = catalog.PROBE_TIMEOUT

    assert isinstance(timeout, httpx.Timeout)
    assert timeout.connect == 5.0
    assert timeout.read == 30.0
    assert timeout.write == 10.0
    assert timeout.pool == 5.0
    assert timeout.read > timeout.connect


def test_probe_accepts_an_explicit_float_timeout() -> None:
    ok, message = catalog.probe_connection(
        model="gpt-4o-mini",
        provider="openai",
        timeout=1.0,
        client=_mock_client(lambda request: httpx.Response(200, json={})),
    )

    assert ok is True
    assert message == "连接成功"


# --- provider whitelist (issue 7aa58) ---------------------------------------


def test_list_catalog_only_exposes_the_whitelisted_providers() -> None:
    assert catalog.ALLOWED_PROVIDER_IDS == (
        "deepseek",
        "openai",
        "anthropic",
        "zhipuai",
        "zhipuai-coding-plan",
    )

    entries = catalog.list_catalog()

    assert tuple(entry.id for entry in entries) == catalog.ALLOWED_PROVIDER_IDS
    snapshot = {provider["id"]: provider for provider in _snapshot_data()["providers"]}
    for entry in entries:
        assert [model.id for model in entry.models] == [
            model["id"] for model in snapshot[entry.id]["models"]
        ]


def test_list_catalog_two_zhipu_providers_stay_separate() -> None:
    entries = catalog.list_catalog()

    assert [entry.id for entry in entries if entry.id.startswith("zhipuai")] == [
        "zhipuai",
        "zhipuai-coding-plan",
    ]


def test_list_catalog_keeps_query_filter_inside_the_whitelist() -> None:
    matches = catalog.list_catalog(query="glm")

    assert matches
    assert {entry.id for entry in matches} <= set(catalog.ALLOWED_PROVIDER_IDS)
    for entry in matches:
        assert all("glm" in f"{model.id} {model.label}".lower() for model in entry.models)


def test_list_catalog_rejects_providers_outside_the_whitelist() -> None:
    assert catalog.list_catalog(provider="nearai") == []
    assert catalog.list_catalog(provider="openai,anthropic") == []
    assert catalog.list_catalog(provider="OpenAI") == []


def test_snapshot_file_keeps_the_full_models_dev_tree() -> None:
    data = _snapshot_data()

    assert len(data["providers"]) > len(catalog.ALLOWED_PROVIDER_IDS)
    assert "nearai" in {provider["id"] for provider in data["providers"]}
