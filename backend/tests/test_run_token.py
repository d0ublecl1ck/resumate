"""Run credentials: short-lived, resume-scoped Bearer secrets (issue 8f5fe).

Setup uses the real cookie + Redis session flow; the run credential itself is
then exercised on the agent operation endpoints, exactly like test_pat_auth does
for PATs.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.access.models import AccessLog
from app.modules.agent import run_token

import support


def _register(session: TestClient, email: str = "run-token@example.com") -> str:
    response = support.register_verified(session, email=email, password="password123", name="Run 用户")
    assert response.status_code == 200, response.text
    me = session.get("/auth/me")
    assert me.status_code == 200, me.text
    return me.json()["id"]


def _document() -> dict:
    return {
        "basics": {
            "fullName": "张沐",
            "headline": "高级前端工程师",
            "email": "zhangmu@example.com",
            "phone": "",
            "location": "上海",
            "links": [],
        },
        "sections": [
            {
                "id": "sec_experience",
                "kind": "experience",
                "title": "工作经历",
                "entries": [{"id": "entry_1", "title": "高级前端工程师", "bullets": ["负责核心页面"]}],
            }
        ],
    }


def _create_resume(session: TestClient, title: str = "运行体凭据测试") -> dict:
    response = session.post(
        "/resumes",
        json={"title": title, "templateId": "tpl_classic", "targetRole": "前端", "tags": [], "document": _document()},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _bearer(secret: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {secret}"}


def _issue(
    fake_redis,
    *,
    owner_id: str,
    resume_id: str,
    ttl: int = 120,
    max_uses: int = 50,
    run_id: str = "run_test",
) -> str:
    return run_token.issue_run_token(
        fake_redis,
        owner_id=owner_id,
        resume_id=resume_id,
        run_id=run_id,
        ttl_seconds=ttl,
        max_uses=max_uses,
    )


def _audit(db: Session, purpose: str) -> list[AccessLog]:
    return list(db.scalars(select(AccessLog).where(AccessLog.purpose == purpose)))


def _upsert_section_op() -> dict:
    return {
        "op": "upsertSection",
        "section": {"id": "sec_run", "kind": "experience", "title": "经历", "entries": []},
    }


def test_run_token_drives_its_own_resume(session_clients, fake_redis) -> None:
    session = session_clients()
    owner = _register(session)
    resume = _create_resume(session)
    secret = _issue(fake_redis, owner_id=owner, resume_id=resume["id"])
    runner_client = session_clients()

    created = runner_client.post(
        f"/resumes/{resume['id']}/turns",
        json={"executionMode": "full_access", "source": "client"},
        headers=_bearer(secret),
    )

    assert created.status_code == 201, created.text
    turn = created.json()
    # A delegated run credential cannot pick its own mode or source.
    assert turn["executionMode"] == "approval"
    assert turn["modeSource"] == "account"
    assert turn["source"] == "agent"

    working = runner_client.get(f"/resumes/{resume['id']}/working-document", headers=_bearer(secret))
    assert working.status_code == 200, working.text

    state = runner_client.get(f"/turns/{turn['id']}/state", headers=_bearer(secret))
    assert state.status_code == 200, state.text
    written = runner_client.put(
        f"/turns/{turn['id']}/state",
        json={"stateVersion": state.json()["stateVersion"], "runState": {"phase": "running"}},
        headers=_bearer(secret),
    )
    assert written.status_code == 200, written.text


def test_run_token_is_rejected_on_another_resume(session_clients, fake_redis, db_session) -> None:
    session = session_clients()
    owner = _register(session)
    resume = _create_resume(session)
    other = _create_resume(session, title="另一份简历")
    secret = _issue(fake_redis, owner_id=owner, resume_id=resume["id"])
    runner_client = session_clients()

    denied = runner_client.post(f"/resumes/{other['id']}/turns", json={}, headers=_bearer(secret))

    assert denied.status_code == 403, denied.text
    assert denied.json()["code"] == "FORBIDDEN"
    rows = _audit(db_session, "run_token_scope")
    assert [row.result for row in rows] == ["denied"]
    assert rows[0].error_code == "FORBIDDEN"
    assert rows[0].resource == f"/resumes/{other['id']}/turns"


def test_run_token_is_refused_outside_its_endpoint_allowlist(session_clients, fake_redis, db_session) -> None:
    session = session_clients()
    owner = _register(session)
    resume = _create_resume(session)
    secret = _issue(fake_redis, owner_id=owner, resume_id=resume["id"])
    runner_client = session_clients()

    denied = runner_client.get("/access/tokens", headers=_bearer(secret))

    assert denied.status_code == 403, denied.text
    rows = _audit(db_session, "run_token_scope")
    assert [row.result for row in rows] == ["denied"]
    assert rows[0].resource == "/access/tokens"


def test_expired_run_token_is_rejected_with_an_audit_row(session_clients, fake_redis, db_session) -> None:
    session = session_clients()
    owner = _register(session)
    resume = _create_resume(session)
    secret = _issue(fake_redis, owner_id=owner, resume_id=resume["id"])
    key = f"{run_token.RUN_TOKEN_KEY_PREFIX}{run_token.hash_run_token(secret)}"
    payload = json.loads(fake_redis.get(key))
    payload["expiresAt"] = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    fake_redis.set(key, json.dumps(payload), ex=120)
    runner_client = session_clients()

    denied = runner_client.get(f"/resumes/{resume['id']}/working-document", headers=_bearer(secret))

    assert denied.status_code == 401, denied.text
    assert denied.json()["code"] == "UNAUTHENTICATED"
    rows = _audit(db_session, "run_token_auth")
    assert [row.result for row in rows] == ["denied"]
    assert rows[0].error_code == "UNAUTHENTICATED"


def test_unknown_run_token_is_rejected_with_an_audit_row(session_clients, fake_redis, db_session) -> None:
    session = session_clients()
    _register(session)
    resume = _create_resume(session)
    runner_client = session_clients()

    denied = runner_client.get(
        f"/resumes/{resume['id']}/working-document",
        headers=_bearer("rsm_run_not-a-real-secret"),
    )

    assert denied.status_code == 401, denied.text
    rows = _audit(db_session, "run_token_auth")
    assert [row.result for row in rows] == ["denied"]


def test_run_token_use_limit_revokes_the_credential(session_clients, fake_redis, db_session) -> None:
    session = session_clients()
    owner = _register(session)
    resume = _create_resume(session)
    secret = _issue(fake_redis, owner_id=owner, resume_id=resume["id"], max_uses=2)
    runner_client = session_clients()
    url = f"/resumes/{resume['id']}/working-document"

    assert runner_client.get(url, headers=_bearer(secret)).status_code == 200
    assert runner_client.get(url, headers=_bearer(secret)).status_code == 200

    denied = runner_client.get(url, headers=_bearer(secret))
    assert denied.status_code == 403, denied.text
    assert denied.json()["code"] == "FORBIDDEN"
    rows = _audit(db_session, "run_token_auth")
    assert [row.result for row in rows] == ["denied"]
    assert rows[0].error_code == "FORBIDDEN"

    # Exhaustion revokes the secret, so the next call is simply unknown.
    after = runner_client.get(url, headers=_bearer(secret))
    assert after.status_code == 401, after.text


def test_run_token_cannot_decide_its_own_pending_action(session_clients, fake_redis, db_session) -> None:
    session = session_clients()
    owner = _register(session)
    resume = _create_resume(session)
    secret = _issue(fake_redis, owner_id=owner, resume_id=resume["id"])
    runner_client = session_clients()

    turn = runner_client.post(f"/resumes/{resume['id']}/turns", json={}, headers=_bearer(secret)).json()
    preview = runner_client.post(
        f"/turns/{turn['id']}/patches:preview",
        json={"ops": [_upsert_section_op()]},
        headers=_bearer(secret),
    )
    assert preview.status_code == 200, preview.text
    pending_id = preview.json()["pendingActionId"]

    for decision in ("approve", "reject"):
        denied = runner_client.post(f"/pending-actions/{pending_id}/{decision}", json={}, headers=_bearer(secret))
        assert denied.status_code == 403, denied.text
        assert denied.json()["code"] == "FORBIDDEN"

    actions = session.get(f"/turns/{turn['id']}/pending-actions").json()
    assert [action["state"] for action in actions if action["id"] == pending_id] == ["pending"]

    rows = _audit(db_session, "run_human_session")
    assert len(rows) == 2
    assert [row.result for row in rows] == ["denied", "denied"]
    assert {row.error_code for row in rows} == {"FORBIDDEN"}
