"""Agent sessions, messages and run checkpoints (issue 9d29a)."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.modules.agent import dao
from app.modules.agent.models import AgentSession


def _document() -> dict:
    return {
        "basics": {"fullName": "示例同学", "headline": "", "email": "", "phone": "", "location": "", "links": []},
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


# --- derived session titles (issue 360b1) ---------------------------------------

TITLE_MAX_LENGTH = 24


def _add_message(client: TestClient, session_id: str, seq: int, role: str, content: object) -> None:
    response = client.post(
        f"/sessions/{session_id}/messages",
        json={"seq": seq, "role": role, "content": content},
    )
    assert response.status_code == 201, response.text


def _session_items(client: TestClient) -> dict:
    response = client.get("/sessions")
    assert response.status_code == 200, response.text
    return {item["id"]: item for item in response.json()}


def test_list_sessions_derives_title_from_first_user_message(client: TestClient) -> None:
    session = _create_session(client)
    sid = session["id"]
    # 36 ASCII chars, so the 24-char boundary is unambiguous.
    _add_message(client, sid, 1, "user", "abcdefghijklmnopqrstuvwxyz0123456789")
    _add_message(client, sid, 2, "assistant", {"text": "IGNORE-THE-ASSISTANT"})

    item = _session_items(client)[sid]

    assert item["title"] == "abcdefghijklmnopqrstuvwx…"
    assert item["title"] != "IGNORE-THE-ASSISTANT"
    assert item["messageCount"] == 2


def test_session_title_truncates_only_beyond_the_limit(client: TestClient) -> None:
    exact = _create_session(client)
    _add_message(client, exact["id"], 1, "user", "abcdefghijklmnopqrstuvwx")
    longer = _create_session(client)
    _add_message(client, longer["id"], 1, "user", "abcdefghijklmnopqrstuvwxy")

    items = _session_items(client)

    assert items[exact["id"]]["title"] == "abcdefghijklmnopqrstuvwx"
    assert items[longer["id"]]["title"] == "abcdefghijklmnopqrstuvwx…"
    assert len("abcdefghijklmnopqrstuvwx") == TITLE_MAX_LENGTH


def test_session_title_reads_wire_text_and_plain_shapes(client: TestClient) -> None:
    cases = {
        "wire": {"role": "user", "content": "wire 形态的用户消息"},
        "text": {"text": "text 形态的用户消息"},
        "plain": "纯字符串用户消息",
    }
    ids: dict[str, str] = {}
    for name, content in cases.items():
        sid = _create_session(client)["id"]
        _add_message(client, sid, 1, "user", content)
        ids[name] = sid

    items = _session_items(client)

    assert items[ids["wire"]]["title"] == "wire 形态的用户消息"
    assert items[ids["text"]]["title"] == "text 形态的用户消息"
    assert items[ids["plain"]]["title"] == "纯字符串用户消息"


def test_session_title_trims_surrounding_whitespace(client: TestClient) -> None:
    sid = _create_session(client)["id"]
    _add_message(client, sid, 1, "user", "   去掉首尾空白   ")

    assert _session_items(client)[sid]["title"] == "去掉首尾空白"


def test_session_title_falls_back_to_null_without_a_user_message(client: TestClient) -> None:
    empty = _create_session(client)["id"]
    system_only = _create_session(client)["id"]
    _add_message(client, system_only, 1, "system", "系统提示")
    blank = _create_session(client)["id"]
    _add_message(client, blank, 1, "user", "   ")
    assistant_only = _create_session(client)["id"]
    _add_message(client, assistant_only, 1, "assistant", {"text": "只有助手消息"})

    items = _session_items(client)

    for sid in (empty, system_only, blank, assistant_only):
        assert items[sid]["title"] is None, items[sid]
    assert items[empty]["messageCount"] == 0
    assert items[system_only]["messageCount"] == 1


def test_session_title_never_uses_assistant_or_system_messages(client: TestClient) -> None:
    sid = _create_session(client)["id"]
    _add_message(client, sid, 1, "assistant", {"text": "assistant-first"})
    _add_message(client, sid, 2, "system", "system-second")
    _add_message(client, sid, 3, "user", "真正的首条用户消息")
    _add_message(client, sid, 4, "assistant", {"text": "assistant-last"})

    item = _session_items(client)[sid]

    assert item["title"] == "真正的首条用户消息"
    assert "assistant-first" not in (item["title"] or "")
    assert item["messageCount"] == 4


def test_session_message_count_counts_every_role(client: TestClient) -> None:
    sid = _create_session(client)["id"]
    _add_message(client, sid, 1, "system", "s")
    _add_message(client, sid, 2, "user", "u")
    _add_message(client, sid, 3, "assistant", {"text": "a"})
    _add_message(client, sid, 4, "tool", {"result": "t"})

    assert _session_items(client)[sid]["messageCount"] == 4


def test_list_sessions_keeps_recent_first_with_titles(client: TestClient, db_session: Session) -> None:
    assert client.get("/sessions").json() == []

    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _add_session(db_session, "sess_old", "user_test", active=base)
    _add_session(db_session, "sess_new", "user_test", active=base + timedelta(hours=1))
    _add_message(client, "sess_old", 1, "user", "旧话题")
    _add_message(client, "sess_new", 1, "user", "新话题")

    response = client.get("/sessions")

    assert response.status_code == 200, response.text
    assert [item["id"] for item in response.json()] == ["sess_new", "sess_old"]
    assert [item["title"] for item in response.json()] == ["新话题", "旧话题"]


def test_list_sessions_resolves_titles_in_one_statement(
    client: TestClient, db_session: Session, engine
) -> None:
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    _add_session(db_session, "sess_a", "user_test", active=base)
    _add_session(db_session, "sess_b", "user_test", active=base + timedelta(hours=1))
    _add_message(client, "sess_a", 1, "user", "话题 A")
    _add_message(client, "sess_b", 1, "user", "话题 B")

    statements: list[str] = []

    def _record(conn, cursor, statement, parameters, context, executemany) -> None:  # type: ignore[no-untyped-def]
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        rows = dao.list_sessions(db_session, "user_test")
    finally:
        event.remove(engine, "before_cursor_execute", _record)

    selects = [statement for statement in statements if statement.lstrip().lower().startswith("select")]
    assert len(selects) == 1, statements
    assert [row.session.id for row in rows] == ["sess_b", "sess_a"]
    assert [row.first_user_content for row in rows] == ["话题 B", "话题 A"]
    assert [row.message_count for row in rows] == [1, 1]
