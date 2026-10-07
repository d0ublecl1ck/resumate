"""Profile-scope agent endpoints used by a profile run (issue 60a52)."""

from fastapi.testclient import TestClient

from app.modules.agent import run_token

import support


def _document() -> dict:
    return {
        "basics": {"fullName": "张沐", "headline": "", "email": "", "phone": "", "location": "", "links": []},
        "sections": [],
    }


def _create_resume(client: TestClient) -> dict:
    response = client.post(
        "/resumes",
        json={"title": "主档端点测试", "templateId": "tpl_classic", "targetRole": "测试", "tags": [], "document": _document()},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_session(client: TestClient) -> str:
    response = client.post("/sessions", json={})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _create_fact_op(title: str = "Rust") -> dict:
    return {"op": "create_fact", "payload": {"type": "skill", "title": title, "content": "来自助手"}}


def test_session_turns_are_listed_newest_first_with_pending_actions(client: TestClient) -> None:
    session_id = _create_session(client)
    first = client.post("/turns", json={"scope": "profile", "sessionId": session_id, "message": "第一轮"}).json()
    second = client.post("/turns", json={"scope": "profile", "sessionId": session_id, "message": "第二轮"}).json()

    rows = client.get(f"/sessions/{session_id}/turns").json()

    assert [row["id"] for row in rows] == [second["id"], first["id"]]
    assert all(row["scope"] == "profile" for row in rows)
    assert "pendingActions" in rows[0]


def test_session_turns_unknown_session_is_404(client: TestClient) -> None:
    response = client.get("/sessions/sess_missing/turns")

    assert response.status_code == 404, response.text
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_profile_actions_reject_a_resume_turn(client: TestClient) -> None:
    resume = _create_resume(client)
    turn = client.post(f"/resumes/{resume['id']}/turns", json={}).json()

    response = client.post(f"/turns/{turn['id']}/profile-actions", json={"ops": [_create_fact_op()]})

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_profile_actions_unknown_turn_is_404(client: TestClient) -> None:
    response = client.post("/turns/turn_missing/profile-actions", json={"ops": [_create_fact_op()]})

    assert response.status_code == 404, response.text
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_profile_finalize_closes_the_turn(client: TestClient) -> None:
    session_id = _create_session(client)
    turn = client.post("/turns", json={"scope": "profile", "sessionId": session_id}).json()

    response = client.post(f"/turns/{turn['id']}/finalize", json={"message": "主档整理完成"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["state"] == "finalized"
    assert body["result"]["resumeId"] is None


def test_profile_finalize_marks_pending_actions_stale(client: TestClient) -> None:
    """A profile turn must expire its pending actions when it closes (issue fe56e)."""
    session_id = _create_session(client)
    turn = client.post("/turns", json={"scope": "profile", "sessionId": session_id}).json()
    proposed = client.post(f"/turns/{turn['id']}/profile-actions", json={"ops": [_create_fact_op()]})
    assert proposed.status_code == 200, proposed.text
    pending_id = proposed.json()["pendingActionId"]
    assert pending_id

    finalized = client.post(f"/turns/{turn['id']}/finalize", json={})
    assert finalized.status_code == 200, finalized.text

    action = client.get(f"/turns/{turn['id']}/pending-actions").json()[0]
    assert action["id"] == pending_id
    assert action["state"] == "stale"
    assert action["staleReason"]


def test_run_credential_can_propose_but_not_approve(session_clients, fake_redis) -> None:
    session = session_clients()
    registered = support.register_verified(
        session, email="profile-tools-run@example.com", password="password123", name="Run 用户"
    )
    assert registered.status_code == 200, registered.text
    owner = session.get("/auth/me").json()["id"]
    session_id = session.post("/sessions", json={}).json()["id"]
    turn = session.post("/turns", json={"scope": "profile", "sessionId": session_id}).json()
    secret = run_token.issue_run_token(
        fake_redis, owner_id=owner, resume_id=None, run_id="run_p", ttl_seconds=120, max_uses=50
    )
    runner = session_clients()
    headers = {"Authorization": f"Bearer {secret}"}

    proposed = runner.post(
        f"/turns/{turn['id']}/profile-actions",
        json={"ops": [_create_fact_op("Rust 高性能")]},
        headers=headers,
    )

    assert proposed.status_code == 200, proposed.text
    pending_id = proposed.json()["pendingActionId"]
    assert pending_id

    # e9ad6: a run credential may propose but never decide.
    denied = runner.post(f"/pending-actions/{pending_id}/approve", json={}, headers=headers)
    assert denied.status_code == 403, denied.text
    assert denied.json()["code"] == "FORBIDDEN"


def test_run_credential_cannot_touch_another_resume_turn(session_clients, fake_redis) -> None:
    session = session_clients()
    registered = support.register_verified(
        session, email="profile-tools-scope@example.com", password="password123", name="Run 用户"
    )
    assert registered.status_code == 200, registered.text
    owner = session.get("/auth/me").json()["id"]
    resume = session.post(
        "/resumes",
        json={"title": "简历", "templateId": "tpl_classic", "targetRole": "测试", "tags": [], "document": _document()},
    ).json()
    resume_turn = session.post(f"/resumes/{resume['id']}/turns", json={}).json()
    secret = run_token.issue_run_token(
        fake_redis, owner_id=owner, resume_id=None, run_id="run_p", ttl_seconds=120, max_uses=50
    )
    runner = session_clients()

    denied = runner.post(
        f"/turns/{resume_turn['id']}/profile-actions",
        json={"ops": [_create_fact_op()]},
        headers={"Authorization": f"Bearer {secret}"},
    )

    assert denied.status_code == 403, denied.text
    assert denied.json()["code"] == "FORBIDDEN"
