"""End-to-end PAT Bearer authentication and Scope enforcement (issue 78ede).

Uses the real cookie + Redis session flow for setup (issuing PATs) and then
the PAT itself on the agent operation endpoints.
"""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.access.models import PersonalAccessToken


def _register(client: TestClient, email: str = "pat@example.com") -> None:
    response = client.post(
        "/auth/register",
        json={"email": email, "password": "password123", "displayName": "PAT 用户"},
    )
    assert response.status_code == 201, response.text


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


def _create_resume(client: TestClient) -> dict:
    response = client.post(
        "/resumes",
        json={
            "title": "高级前端工程师简历",
            "templateId": "tpl_classic",
            "targetRole": "高级前端工程师",
            "tags": ["前端"],
            "document": _document(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _issue(session_client: TestClient, scopes: list[str], name: str = "脚本令牌") -> dict:
    response = session_client.post("/access/tokens", json={"name": name, "scopes": scopes})
    assert response.status_code == 201, response.text
    return response.json()


def _bearer(secret: str) -> dict:
    return {"Authorization": f"Bearer {secret}"}


def _upsert_section_op() -> dict:
    return {
        "op": "upsertSection",
        "section": {
            "id": "sec_projects",
            "kind": "projects",
            "title": "项目经历",
            "entries": [{"id": "entry_p1", "title": "Resumate", "bullets": ["负责 Agent 操作层"]}],
        },
    }


def _logs(session_client: TestClient) -> list[dict]:
    response = session_client.get("/access/logs")
    assert response.status_code == 200, response.text
    return response.json()


def test_resume_write_pat_can_create_turn_and_apply_patch(session_clients) -> None:
    session = session_clients()
    _register(session)
    resume = _create_resume(session)
    token = _issue(session, ["resume:write"])
    headers = _bearer(token["secretOnce"])
    pat = session_clients()

    created = pat.post(f"/resumes/{resume['id']}/turns", json={}, headers=headers)
    assert created.status_code == 201, created.text
    turn = created.json()
    assert turn["executionMode"] == "approval"
    assert turn["modeSource"] == "account"

    ops = [_upsert_section_op()]
    preview = pat.post(f"/turns/{turn['id']}/patches:preview", json={"ops": ops}, headers=headers)
    assert preview.status_code == 200, preview.text
    pending_id = preview.json()["pendingActionId"]
    assert pending_id.startswith("pa_")

    approved = pat.post(f"/pending-actions/{pending_id}/approve", json={}, headers=headers)
    assert approved.status_code == 200, approved.text

    applied = pat.post(
        f"/turns/{turn['id']}/patches:apply",
        json={"ops": ops, "pendingActionId": pending_id},
        headers=headers,
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["applied"] is True
    assert applied.json()["workingRevision"] == 1


def test_resume_read_pat_cannot_call_write_endpoint(session_clients) -> None:
    session = session_clients()
    _register(session)
    resume = _create_resume(session)
    token = _issue(session, ["resume:read"])
    headers = _bearer(token["secretOnce"])
    pat = session_clients()

    assert pat.get("/resumes", headers=headers).status_code == 200

    denied = pat.post(f"/resumes/{resume['id']}/turns", json={}, headers=headers)
    assert denied.status_code == 403, denied.text
    assert denied.json()["code"] == "SCOPE_INSUFFICIENT"


def test_pat_execution_mode_cannot_escalate_account(session_clients) -> None:
    session = session_clients()
    _register(session)
    resume = _create_resume(session)
    token = _issue(session, ["resume:write"])
    pat = session_clients()

    created = pat.post(
        f"/resumes/{resume['id']}/turns",
        json={"executionMode": "full_access"},
        headers=_bearer(token["secretOnce"]),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["executionMode"] == "approval"
    assert body["modeSource"] == "account"


def test_revoked_pat_returns_token_revoked(session_clients) -> None:
    session = session_clients()
    _register(session)
    token = _issue(session, ["resume:read"])
    assert session.post(f"/access/tokens/{token['id']}/revoke").status_code == 200
    pat = session_clients()

    response = pat.get("/resumes", headers=_bearer(token["secretOnce"]))

    assert response.status_code == 401, response.text
    assert response.json()["code"] == "TOKEN_REVOKED"


def test_expired_pat_returns_unauthenticated(session_clients, db_session: Session) -> None:
    session = session_clients()
    _register(session)
    token = _issue(session, ["resume:read"])
    row = db_session.get(PersonalAccessToken, token["id"])
    assert row is not None
    row.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()
    pat = session_clients()

    response = pat.get("/resumes", headers=_bearer(token["secretOnce"]))

    assert response.status_code == 401, response.text
    assert response.json()["code"] == "UNAUTHENTICATED"


def test_unknown_and_malformed_tokens_return_unauthenticated(session_clients) -> None:
    pat = session_clients()

    unknown = pat.get("/resumes", headers=_bearer("rsm_pat_" + "x" * 32))
    assert unknown.status_code == 401
    assert unknown.json()["code"] == "UNAUTHENTICATED"

    malformed = pat.get("/resumes", headers=_bearer("not-a-pat"))
    assert malformed.status_code == 401
    assert malformed.json()["code"] == "UNAUTHENTICATED"


def test_bearer_takes_priority_over_session_cookie(session_clients) -> None:
    session = session_clients()
    _register(session)
    _create_resume(session)
    token = _issue(session, ["resume:read"])
    assert session.post(f"/access/tokens/{token['id']}/revoke").status_code == 200

    response = session.get("/resumes", headers=_bearer(token["secretOnce"]))

    assert response.status_code == 401
    assert response.json()["code"] == "TOKEN_REVOKED"


def test_pat_auth_writes_allowed_access_log(session_clients, db_session: Session) -> None:
    session = session_clients()
    _register(session)
    _create_resume(session)
    token = _issue(session, ["resume:read"])
    pat = session_clients()

    assert pat.get("/resumes", headers=_bearer(token["secretOnce"])).status_code == 200

    allowed = [log for log in _logs(session) if log["purpose"] == "pat_auth"]
    assert len(allowed) == 1
    assert allowed[0]["result"] == "allowed"
    assert allowed[0]["scope"] == "resume:read"
    assert allowed[0]["errorCode"] is None

    row = db_session.get(PersonalAccessToken, token["id"])
    assert row is not None
    assert row.last_used_at is not None


def test_denied_pat_auth_writes_denied_access_log(session_clients) -> None:
    session = session_clients()
    _register(session)
    token = _issue(session, ["resume:read"])
    assert session.post(f"/access/tokens/{token['id']}/revoke").status_code == 200
    pat = session_clients()

    response = pat.get("/resumes", headers=_bearer(token["secretOnce"]))
    assert response.status_code == 401

    denied = [log for log in _logs(session) if log["purpose"] == "pat_auth" and log["result"] == "denied"]
    assert len(denied) == 1
    assert denied[0]["errorCode"] == "TOKEN_REVOKED"


def test_scope_denial_writes_denied_access_log(session_clients) -> None:
    session = session_clients()
    _register(session)
    resume = _create_resume(session)
    token = _issue(session, ["resume:read"])
    pat = session_clients()

    response = pat.post(f"/resumes/{resume['id']}/turns", json={}, headers=_bearer(token["secretOnce"]))
    assert response.status_code == 403

    scope_logs = [log for log in _logs(session) if log["purpose"] == "pat_scope"]
    assert len(scope_logs) == 1
    assert scope_logs[0]["result"] == "denied"
    assert scope_logs[0]["scope"] == "resume:write"
    assert scope_logs[0]["errorCode"] == "SCOPE_INSUFFICIENT"
