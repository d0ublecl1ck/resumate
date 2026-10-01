"""Agent sessions, messages and run checkpoints (issue 9d29a)."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.agent import dao
from app.modules.agent.models import AgentSession


def _document() -> dict:
    return {
        "basics": {"fullName": "张沐", "headline": "", "email": "", "phone": "", "location": "", "links": []},
        "sections": [],
    }


def _create_resume(client: TestClient) -> dict:
    response = client.post(
        "/resumes",
        json={
            "title": "会话测试简历",
            "templateId": "tpl_classic",
            "targetRole": "测试",
            "tags": [],
            "document": _document(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_session(client: TestClient) -> dict:
    response = client.post("/sessions", json={})
    assert response.status_code == 201, response.text
    return response.json()


def _add_session(db: Session, session_id: str, owner_id: str, *, active: datetime) -> None:
    db.add(
        AgentSession(
            id=session_id,
            owner_id=owner_id,
            created_at=active,
            updated_at=active,
            last_active_at=active,
        )
    )
    db.commit()


def test_create_session_returns_identity_and_timestamps(client: TestClient) -> None:
    session = _create_session(client)

    assert session["id"].startswith("sess_")
    assert session["createdAt"] and session["updatedAt"] and session["lastActiveAt"]


def test_list_sessions_is_owner_scoped_and_recent_first(client: TestClient, db_session: Session) -> None:
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _add_session(db_session, "sess_old", "user_test", active=base)
    _add_session(db_session, "sess_new", "user_test", active=base + timedelta(hours=1))
    _add_session(db_session, "sess_other", "other_user", active=base + timedelta(hours=2))

    response = client.get("/sessions")

    assert response.status_code == 200, response.text
    assert [item["id"] for item in response.json()] == ["sess_new", "sess_old"]


def test_session_messages_incremental_and_idempotent(client: TestClient) -> None:
    session = _create_session(client)
    sid = session["id"]

    created = client.post(f"/sessions/{sid}/messages", json={"seq": 1, "role": "user", "content": "你好"})
    assert created.status_code == 201, created.text
    first = created.json()
    assert first["seq"] == 1 and first["role"] == "user" and first["content"] == "你好"

    replay = client.post(f"/sessions/{sid}/messages", json={"seq": 1, "role": "user", "content": "你好"})
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == first["id"]
    assert len(client.get(f"/sessions/{sid}/messages").json()) == 1

    # Same seq, different payload: still the existing row, never a duplicate.
    conflicting = client.post(f"/sessions/{sid}/messages", json={"seq": 1, "role": "user", "content": "改了"})
    assert conflicting.json()["id"] == first["id"]
    assert len(client.get(f"/sessions/{sid}/messages").json()) == 1

    second = client.post(f"/sessions/{sid}/messages", json={"seq": 2, "role": "assistant", "content": {"text": "hi"}})
    assert second.status_code == 201, second.text

    after_one = client.get(f"/sessions/{sid}/messages", params={"afterSeq": 1}).json()
    assert [item["seq"] for item in after_one] == [2]
    assert client.get(f"/sessions/{sid}/messages", params={"afterSeq": 2}).json() == []


def test_turn_state_roundtrip_and_optimistic_lock(client: TestClient) -> None:
    resume = _create_resume(client)
    turn = client.post(f"/resumes/{resume['id']}/turns", json={}).json()

    initial = client.get(f"/turns/{turn['id']}/state")
    assert initial.status_code == 200, initial.text
    assert initial.json() == {"turnId": turn["id"], "runState": {}, "stateVersion": 0}

    saved = client.put(
        f"/turns/{turn['id']}/state",
        json={"stateVersion": 0, "runState": {"phase": "running", "messages": [{"role": "user", "content": "hi"}]}},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["stateVersion"] == 1
    assert saved.json()["runState"]["phase"] == "running"

    stale = client.put(f"/turns/{turn['id']}/state", json={"stateVersion": 0, "runState": {"phase": "stale"}})
    assert stale.status_code == 409, stale.text
    assert stale.json()["code"] == "RUN_STATE_CONFLICT"

    assert client.get(f"/turns/{turn['id']}/state").json()["stateVersion"] == 1


def test_unknown_sessions_and_turns_are_404(client: TestClient) -> None:
    assert client.get("/sessions/sess_missing/messages").status_code == 404
    assert (
        client.post("/sessions/sess_missing/messages", json={"seq": 1, "role": "user", "content": "x"}).status_code
        == 404
    )
    assert client.get("/turns/turn_missing/state").status_code == 404
    assert client.put("/turns/turn_missing/state", json={"stateVersion": 0, "runState": {}}).status_code == 404


def test_create_turn_attaches_session_and_refreshes_activity(client: TestClient, db_session: Session) -> None:
    resume = _create_resume(client)
    session = _create_session(client)
    stale_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
    row = dao.get_session(db_session, session["id"])
    assert row is not None
    row.last_active_at = stale_time
    db_session.commit()

    response = client.post(f"/resumes/{resume['id']}/turns", json={"sessionId": session["id"]})

    assert response.status_code == 201, response.text
    assert response.json()["sessionId"] == session["id"]
    db_session.expire_all()
    refreshed = dao.get_session(db_session, session["id"])
    assert refreshed is not None and refreshed.last_active_at > stale_time

    missing = client.post(f"/resumes/{resume['id']}/turns", json={"sessionId": "sess_missing"})
    assert missing.status_code == 404
