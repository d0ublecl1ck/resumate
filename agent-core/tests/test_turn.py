"""TurnSession lifecycle across approval and full_access modes."""

from __future__ import annotations

import json

import httpx
import pytest

from conftest import apply_payload, pending_payload, preview_payload, result_payload, turn_payload
from resumate_agent_core import TurnSession, patches
from resumate_agent_core.turn import make_idempotency_key


def body_of(request: httpx.Request):
    return json.loads(request.content) if request.content else None


def make_router(execution_mode="approval"):
    calls = []

    def handler(request):
        path = request.url.path
        calls.append({"method": request.method, "path": path, "body": body_of(request)})
        if path == "/resumes/res_1/turns" and request.method == "POST":
            return httpx.Response(201, json=turn_payload(executionMode=execution_mode))
        if path == "/turns/turn_1" and request.method == "GET":
            return httpx.Response(200, json=turn_payload(executionMode=execution_mode))
        if path == "/turns/turn_1/patches:preview":
            return httpx.Response(200, json=preview_payload())
        if path == "/pending-actions/pa_1/approve":
            return httpx.Response(200, json=pending_payload(state="approved"))
        if path == "/turns/turn_1/patches:apply":
            return httpx.Response(200, json=apply_payload())
        if path == "/turns/turn_1/finalize":
            return httpx.Response(
                200,
                json=turn_payload(
                    state="finalized",
                    closedAt="2026-01-02T00:00:00Z",
                    result=result_payload(),
                ),
            )
        if path == "/turns/turn_1/cancel":
            return httpx.Response(
                200,
                json=turn_payload(
                    state="cancelled",
                    closedAt="2026-01-02T00:00:00Z",
                    result=result_payload(state="cancelled", versionId=None),
                ),
            )
        raise AssertionError(f"unexpected {request.method} {path}")

    return handler, calls


def test_approval_flow_previews_approves_applies_and_finalizes(make_client):
    handler, calls = make_router("approval")
    with make_client(handler) as client:
        with TurnSession(client, "res_1", execution_mode="approval") as turn:
            preview = turn.preview(patches.remove_section("s1"))
            assert preview.pending_action_id == "pa_1"
            assert turn.pending_action_id == "pa_1"
            approved = turn.approve()
            assert approved.state == "approved"
            applied = turn.apply(patches.remove_section("s1"), idempotency_key="idem-1")
            assert applied.applied is True
            closed = turn.finalize(message="done")

    assert closed.state == "finalized"
    assert closed.result is not None
    assert closed.result.version_id == "ver_1"
    assert [call["path"] for call in calls] == [
        "/resumes/res_1/turns",
        "/turns/turn_1/patches:preview",
        "/pending-actions/pa_1/approve",
        "/turns/turn_1/patches:apply",
        "/turns/turn_1/finalize",
    ]
    assert calls[3]["body"]["pendingActionId"] == "pa_1"
    assert calls[3]["body"]["idempotencyKey"] == "idem-1"


def test_apply_auto_uses_pending_action_from_preview(make_client):
    handler, calls = make_router("approval")
    with make_client(handler) as client:
        with TurnSession(client, "res_1") as turn:
            turn.preview(patches.remove_section("s1"))
            turn.apply(patches.remove_section("s1"))

    assert calls[2]["body"]["pendingActionId"] == "pa_1"


def test_execute_patch_full_access_skips_approval(make_client):
    handler, calls = make_router("full_access")
    with make_client(handler) as client:
        with TurnSession(client, "res_1", execution_mode="full_access") as turn:
            result = turn.execute_patch(patches.remove_section("s1"))

    assert result.applied is True
    assert [call["path"] for call in calls] == [
        "/resumes/res_1/turns",
        "/turns/turn_1/patches:apply",
    ]


def test_execute_patch_approval_routes_through_preview_and_approve(make_client):
    handler, calls = make_router("approval")
    with make_client(handler) as client:
        with TurnSession(client, "res_1", execution_mode="approval") as turn:
            result = turn.execute_patch(patches.remove_section("s1"))

    assert result.applied is True
    assert [call["path"] for call in calls] == [
        "/resumes/res_1/turns",
        "/turns/turn_1/patches:preview",
        "/pending-actions/pa_1/approve",
        "/turns/turn_1/patches:apply",
    ]


def test_context_manager_cancels_on_unhandled_error(make_client):
    handler, calls = make_router("approval")
    with make_client(handler) as client:
        with pytest.raises(RuntimeError):
            with TurnSession(client, "res_1") as turn:
                assert turn.open is True
                raise RuntimeError("boom")

    assert calls[-1]["path"] == "/turns/turn_1/cancel"


def test_adopts_existing_turn(make_client):
    handler, calls = make_router("approval")
    with make_client(handler) as client:
        session = TurnSession(client, "res_1", turn_id="turn_1")

    assert session.turn_id == "turn_1"
    assert calls == [{"method": "GET", "path": "/turns/turn_1", "body": None}]


def test_approve_without_preview_raises(make_client):
    handler, _ = make_router("approval")
    with make_client(handler) as client:
        turn = TurnSession(client, "res_1")
        turn.begin()
        with pytest.raises(ValueError):
            turn.approve()
        turn.cancel()


def test_cancel_settles_the_turn(make_client):
    handler, _ = make_router("approval")
    with make_client(handler) as client:
        turn = TurnSession(client, "res_1")
        turn.begin()
        closed = turn.cancel(reason="user changed mind")

    assert closed.state == "cancelled"
    assert closed.result is not None
    assert closed.result.state == "cancelled"


def test_idempotency_key_is_stable_and_payload_sensitive():
    first = make_idempotency_key("turn_1", "apply", {"ops": [{"op": "removeSection"}]})
    same = make_idempotency_key("turn_1", "apply", {"ops": [{"op": "removeSection"}]})
    other_payload = make_idempotency_key("turn_1", "apply", {"ops": [{"op": "setBasics"}]})
    other_turn = make_idempotency_key("turn_2", "apply", {"ops": [{"op": "removeSection"}]})

    assert first == same
    assert first != other_payload
    assert first != other_turn
    assert first.startswith("apply-")
