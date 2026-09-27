"""Contract section 6: endpoint paths, request bodies, and error mapping."""

from __future__ import annotations

import json

import httpx
import pytest

from conftest import (
    BASE,
    apply_payload,
    capability_payload,
    pending_payload,
    preview_payload,
    result_payload,
    turn_payload,
    working_document_payload,
)
from resumate_agent_core import (
    AgentCoreSettings,
    ApiClientError,
    TransportError,
    patches,
)
from resumate_agent_core.errors import MalformedResponseError


def body_of(request: httpx.Request):
    return json.loads(request.content) if request.content else None


def test_create_turn_sends_contract_body_and_auth(make_client):
    seen = {}

    def handler(request):
        seen["method"] = request.method
        seen["url"] = str(request.url)
        seen["body"] = body_of(request)
        seen["cookie"] = request.headers.get("cookie")
        return httpx.Response(201, json=turn_payload())

    with make_client(handler) as client:
        turn = client.create_turn("res_1", execution_mode="approval", message="hi", source="agent")

    assert turn.id == "turn_1"
    assert turn.resume_id == "res_1"
    assert turn.execution_mode == "approval"
    assert turn.mode_source == "account"
    assert turn.state == "open"
    assert seen["method"] == "POST"
    assert seen["url"] == f"{BASE}/resumes/res_1/turns"
    assert seen["body"] == {"executionMode": "approval", "source": "agent", "message": "hi"}
    assert seen["cookie"] == "resumate_session=sess-1"


def test_get_turn_parses_result_and_pending_actions(make_client):
    def handler(request):
        assert request.method == "GET"
        assert request.url.path == "/turns/turn_1"
        return httpx.Response(
            200,
            json=turn_payload(
                state="finalized",
                closedAt="2026-01-02T00:00:00Z",
                result=result_payload(),
                pendingActions=[pending_payload()],
            ),
        )

    with make_client(handler) as client:
        turn = client.get_turn("turn_1")

    assert turn.state == "finalized"
    assert turn.closed_at is not None
    assert turn.result is not None
    assert turn.result.version_id == "ver_1"
    assert turn.result.change_count == 1
    assert turn.pending_actions[0].id == "pa_1"
    assert turn.pending_actions[0].diff[0].change_type == "modified"
    assert turn.pending_actions[0].diff[0].reason == "tighten wording"


def test_validate_patch_targets_validate_endpoint(make_client):
    seen = {}

    def handler(request):
        seen["path"] = request.url.path
        seen["body"] = body_of(request)
        return httpx.Response(
            200,
            json={
                "valid": False,
                "errors": [{"opIndex": 0, "code": "SECTION_NOT_FOUND", "message": "missing"}],
            },
        )

    with make_client(handler) as client:
        result = client.validate_patch("turn_1", [patches.remove_section("gone")], reason="check")

    assert result.valid is False
    assert result.errors[0].op_index == 0
    assert result.errors[0].code == "SECTION_NOT_FOUND"
    assert seen["path"] == "/turns/turn_1/patches:validate"
    assert seen["body"] == {
        "ops": [{"op": "removeSection", "sectionId": "gone"}],
        "reason": "check",
    }


def test_preview_patch_returns_diff_and_pending_action(make_client):
    seen = {}

    def handler(request):
        seen["path"] = request.url.path
        return httpx.Response(200, json=preview_payload())

    with make_client(handler) as client:
        preview = client.preview_patch("turn_1", [patches.remove_section("s1")])

    assert seen["path"] == "/turns/turn_1/patches:preview"
    assert preview.valid is True
    assert preview.pending_action_id == "pa_1"
    assert preview.requires_confirmation is True
    assert preview.affected_sections == ["经历"]
    assert preview.diff[0].after == "new"


def test_apply_patch_body_includes_approval_and_idempotency(make_client):
    seen = {}

    def handler(request):
        seen["path"] = request.url.path
        seen["body"] = body_of(request)
        return httpx.Response(200, json=apply_payload())

    with make_client(handler) as client:
        applied = client.apply_patch(
            "turn_1",
            [patches.remove_section("s1")],
            pending_action_id="pa_1",
            idempotency_key="idem-1",
        )

    assert applied.applied is True
    assert applied.working_revision == 1
    assert applied.idempotent_replay is False
    assert seen["path"] == "/turns/turn_1/patches:apply"
    assert seen["body"] == {
        "ops": [{"op": "removeSection", "sectionId": "s1"}],
        "pendingActionId": "pa_1",
        "idempotencyKey": "idem-1",
    }


def test_patch_request_passthrough_preserves_reason(make_client):
    seen = {}

    def handler(request):
        seen["body"] = body_of(request)
        return httpx.Response(200, json={"valid": True, "errors": []})

    request_body = patches.build_patch([patches.remove_section("s1")], reason="kept")
    with make_client(handler) as client:
        client.validate_patch("turn_1", request_body)

    assert seen["body"]["reason"] == "kept"


def test_pending_action_endpoints(make_client):
    calls = []

    def handler(request):
        calls.append((request.method, request.url.path))
        if request.url.path.endswith("/pending-actions"):
            return httpx.Response(200, json=[pending_payload()])
        if request.url.path.endswith("/approve"):
            return httpx.Response(200, json=pending_payload(state="approved"))
        if request.url.path.endswith("/reject"):
            return httpx.Response(200, json=pending_payload(state="rejected"))
        raise AssertionError(request.url.path)

    with make_client(handler) as client:
        actions = client.list_pending_actions("turn_1")
        approved = client.approve_action("pa_1")
        rejected = client.reject_action("pa_1")

    assert [action.id for action in actions] == ["pa_1"]
    assert approved.state == "approved"
    assert approved.approved is True
    assert rejected.state == "rejected"
    assert calls == [
        ("GET", "/turns/turn_1/pending-actions"),
        ("POST", "/pending-actions/pa_1/approve"),
        ("POST", "/pending-actions/pa_1/reject"),
    ]


def test_get_working_document_parses_domain_model(make_client):
    def handler(request):
        assert request.url.path == "/resumes/res_1/working-document"
        return httpx.Response(200, json=working_document_payload())

    with make_client(handler) as client:
        working = client.get_working_document("res_1")

    assert working.resume_id == "res_1"
    assert working.dirty is True
    assert working.working_revision == 2
    assert working.user_turn_id == "turn_1"
    assert working.document.basics.full_name == "Ada Lovelace"
    assert working.document.sections[0].kind == "experience"
    assert working.document.sections[0].entries[0].id == "e1"


def test_capability_discovery(make_client):
    def handler(request):
        assert request.url.path == "/.well-known/resume-agent"
        return httpx.Response(200, json=capability_payload())

    with make_client(handler) as client:
        capability = client.capability()

    assert capability.contract_version == "1.0"
    assert capability.auth_methods == ["session"]
    assert "agent.pending_actions" in capability.capabilities


def test_error_envelope_becomes_api_client_error(make_client):
    def handler(request):
        return httpx.Response(
            409,
            json={
                "code": "BASE_VERSION_STALE",
                "message": "stale base",
                "latestVersionId": "ver_9",
            },
        )

    with make_client(handler) as client:
        with pytest.raises(ApiClientError) as error:
            client.get_turn("turn_1")

    assert error.value.code == "BASE_VERSION_STALE"
    assert error.value.is_code("BASE_VERSION_STALE")
    assert error.value.status_code == 409
    assert error.value.latest_version_id == "ver_9"
    assert error.value.retryable is True


def test_error_without_envelope_is_generic(make_client):
    def handler(request):
        return httpx.Response(500, text="boom")

    with make_client(handler) as client:
        with pytest.raises(ApiClientError) as error:
            client.capability()

    assert error.value.code == "UNKNOWN"
    assert error.value.payload == "boom"
    assert error.value.retryable is True


def test_transport_error_is_wrapped(make_client):
    def handler(request):
        raise httpx.ConnectError("no route", request=request)

    with make_client(handler) as client:
        with pytest.raises(TransportError) as error:
            client.capability()

    assert error.value.code == "TRANSPORT_ERROR"
    assert error.value.retryable is True


def test_malformed_success_body_is_reported(make_client):
    def handler(request):
        return httpx.Response(200, text="not json", headers={"content-type": "text/plain"})

    with make_client(handler) as client:
        with pytest.raises(MalformedResponseError):
            client.capability()


def test_settings_from_env_normalizes_base_url():
    settings = AgentCoreSettings.from_env(
        {
            "RESUME_AGENT_CORE_BASE_URL": "http://example.test/",
            "RESUME_AGENT_CORE_TIMEOUT_SECONDS": "5",
            "RESUME_AGENT_CORE_SESSION_COOKIE": "abc",
            "RESUME_AGENT_CORE_VERIFY_SSL": "false",
            "RESUME_AGENT_CORE_CLIENT_ID": "codex",
        }
    )
    assert settings.base_url == "http://example.test"
    assert settings.timeout_seconds == 5
    assert settings.session_cookie == "abc"
    assert settings.verify_ssl is False
    assert settings.default_client_id == "codex"
    assert settings.auth_headers()["Cookie"] == "resumate_session=abc"
    assert settings.cookies() == {"resumate_session": "abc"}


def test_settings_reject_invalid_values():
    with pytest.raises(ValueError):
        AgentCoreSettings(base_url="   ")
    with pytest.raises(ValueError):
        AgentCoreSettings(timeout_seconds=0)


def test_token_sends_bearer_header(make_client):
    def handler(request):
        assert request.headers.get("authorization") == "Bearer pat_123"
        return httpx.Response(200, json=capability_payload())

    with make_client(handler, session_cookie=None, token="pat_123") as client:
        client.capability()
