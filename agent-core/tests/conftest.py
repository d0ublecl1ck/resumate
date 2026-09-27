"""Shared payloads and fixtures for the agent-core test suite.

Every test runs against httpx.MockTransport: no network and no database.
"""

from __future__ import annotations

import httpx
import pytest

BASE = "http://testserver"


def diff_payload(**overrides):
    payload = {
        "id": "diff_1",
        "target": "经历 · 前端工程师",
        "changeType": "modified",
        "before": "old",
        "after": "new",
        "reason": "tighten wording",
        "state": "pending",
    }
    payload.update(overrides)
    return payload


def pending_payload(**overrides):
    payload = {
        "id": "pa_1",
        "userTurnId": "turn_1",
        "kind": "content_patch",
        "title": "Update experience",
        "targetResource": "res_1",
        "baseVersionId": "ver_0",
        "impactSummary": "1 change",
        "requiresTextConfirm": False,
        "state": "pending",
        "staleReason": None,
        "diff": [diff_payload()],
        "createdAt": "2026-01-01T00:00:00Z",
        "decidedAt": None,
    }
    payload.update(overrides)
    return payload


def result_payload(**overrides):
    payload = {
        "state": "finalized",
        "resumeId": "res_1",
        "versionId": "ver_1",
        "changeCount": 1,
        "affectedSections": ["经历"],
        "message": "done",
        "idempotentReplay": False,
    }
    payload.update(overrides)
    return payload


def turn_payload(**overrides):
    payload = {
        "id": "turn_1",
        "resumeId": "res_1",
        "clientId": "external",
        "source": "agent",
        "executionMode": "approval",
        "modeSource": "account",
        "state": "open",
        "baseVersionId": "ver_0",
        "message": "",
        "createdAt": "2026-01-01T00:00:00Z",
        "closedAt": None,
        "result": None,
        "pendingActions": [],
    }
    payload.update(overrides)
    return payload


def preview_payload(**overrides):
    payload = {
        "valid": True,
        "resumeId": "res_1",
        "baseVersionId": "ver_0",
        "changeCount": 1,
        "affectedSections": ["经历"],
        "diff": [diff_payload()],
        "pendingActionId": "pa_1",
        "requiresConfirmation": True,
    }
    payload.update(overrides)
    return payload


def apply_payload(**overrides):
    payload = {
        "applied": True,
        "userTurnId": "turn_1",
        "resumeId": "res_1",
        "changeCount": 1,
        "affectedSections": ["经历"],
        "workingRevision": 1,
        "pendingActionId": "pa_1",
        "idempotentReplay": False,
    }
    payload.update(overrides)
    return payload


def working_document_payload(**overrides):
    payload = {
        "resumeId": "res_1",
        "document": {
            "basics": {"fullName": "Ada Lovelace"},
            "sections": [
                {
                    "id": "exp",
                    "kind": "experience",
                    "title": "经历",
                    "entries": [{"id": "e1", "title": "Engineer"}],
                }
            ],
        },
        "baseVersionId": "ver_0",
        "userTurnId": "turn_1",
        "workingRevision": 2,
        "dirty": True,
    }
    payload.update(overrides)
    return payload


def capability_payload(**overrides):
    payload = {
        "contractVersion": "1.0",
        "openapiUrl": "/openapi.json",
        "mcpUrl": "/mcp",
        "wellKnownUrl": "/.well-known/resume-agent",
        "authMethods": ["session"],
        "capabilities": ["agent.turns", "agent.patches", "agent.pending_actions"],
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def make_client():
    """Build a ResumateClient backed by an httpx.MockTransport handler."""
    from resumate_agent_core import AgentCoreSettings, ResumateClient

    def _make(handler, **settings):
        config_kwargs = {"base_url": BASE, "session_cookie": "sess-1"}
        config_kwargs.update(settings)
        config = AgentCoreSettings(**config_kwargs)
        return ResumateClient(config, transport=httpx.MockTransport(handler))

    return _make
