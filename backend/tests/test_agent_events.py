"""SSE turn subscription (issue b75c6).

Starlette's TestClient buffers the whole response body, so an infinite SSE
stream cannot be read incrementally through it (verified in-session); an httpx
ASGITransport client deadlocks when it closes such a stream early. The transport
contract is therefore pinned by calling the production endpoint function and
inspecting the StreamingResponse it returns, while change detection, heartbeats
and disconnect cleanup are driven against the same production generator
directly and deterministically. Real wire-level streaming is verified with curl
(see docs/agent/agent-operation-api.md section 18).
"""

import json

import pytest
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.agent import api as agent_api
from app.modules.agent import events, service

from conftest import TEST_USER


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


def _create(client: TestClient) -> dict:
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


def _begin(client: TestClient, resume_id: str) -> dict:
    response = client.post(f"/resumes/{resume_id}/turns", json={})
    assert response.status_code == 201, response.text
    return response.json()


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


def _parse(frame: str) -> tuple[str | None, str | None, int | None]:
    """Parse one SSE frame into (event, data, id); comment frames report event="comment"."""
    event: str | None = None
    data: str | None = None
    event_id: int | None = None
    for line in frame.splitlines():
        if not line:
            continue
        if line.startswith(":"):
            event = "comment"
            continue
        field, _, value = line.partition(":")
        value = value.lstrip(" ")
        if field == "event":
            event = value
        elif field == "data":
            data = value
        elif field == "id":
            event_id = int(value)
    return event, data, event_id


def _start(client: TestClient, db_session: Session, *, poll: float, heartbeat: float):
    resume = _create(client)
    turn = _begin(client, resume["id"])
    initial = service.get_turn(db_session, TEST_USER, turn["id"])
    stream = events.turn_event_stream(
        db_session,
        TEST_USER,
        turn["id"],
        initial=initial,
        poll_interval=poll,
        heartbeat_interval=heartbeat,
    )
    return turn, stream


def test_turn_event_stream_snapshot_then_updated_on_real_change(client: TestClient, db_session: Session) -> None:
    turn, stream = _start(client, db_session, poll=0.01, heartbeat=30.0)

    assert next(stream) == "retry: 3000\n\n"
    event, data, event_id = _parse(next(stream))
    assert event == "snapshot"
    assert event_id == 1
    snapshot = json.loads(data or "{}")
    assert snapshot["id"] == turn["id"]
    assert snapshot["state"] == "open"
    assert snapshot["pendingActions"] == []

    # A real pending-action change must produce exactly one turn.updated frame.
    preview = client.post(f"/turns/{turn['id']}/patches:preview", json={"ops": [_upsert_section_op()]})
    assert preview.status_code == 200, preview.text
    pending_id = preview.json()["pendingActionId"]

    event, data, event_id = _parse(next(stream))
    assert event == "turn.updated"
    assert event_id == 2
    updated = json.loads(data or "{}")
    assert [action["id"] for action in updated["pendingActions"]] == [pending_id]
    assert updated["pendingActions"][0]["state"] == "pending"

    # The human decision (session cookie path) is another real change.
    approved = client.post(f"/pending-actions/{pending_id}/approve", json={})
    assert approved.status_code == 200, approved.text

    event, data, event_id = _parse(next(stream))
    assert event == "turn.updated"
    assert event_id == 3
    assert json.loads(data or "{}")["pendingActions"][0]["state"] == "approved"


def test_turn_event_stream_emits_heartbeat_comment_and_no_fake_events(client: TestClient, db_session: Session) -> None:
    _, stream = _start(client, db_session, poll=0.0, heartbeat=0.0)

    assert next(stream) == "retry: 3000\n\n"
    assert _parse(next(stream))[0] == "snapshot"

    # Nothing changed: the only thing on the wire is a keep-alive comment, never a
    # fabricated progress/token/step event.
    idle_frame = next(stream)
    assert idle_frame == ": heartbeat\n\n"
    assert _parse(idle_frame)[0] == "comment"


def test_turn_event_stream_stops_after_disconnect(client: TestClient, db_session: Session) -> None:
    _, stream = _start(client, db_session, poll=0.0, heartbeat=0.0)

    assert next(stream) == "retry: 3000\n\n"
    assert _parse(next(stream))[0] == "snapshot"

    stream.close()

    with pytest.raises(StopIteration):
        next(stream)


@pytest.mark.anyio
async def test_events_endpoint_declares_sse_transport(client: TestClient, db_session: Session) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"])

    response = agent_api.stream_turn_events(turn["id"], db=db_session, user=TEST_USER)

    assert isinstance(response, StreamingResponse)
    assert response.media_type == "text/event-stream"
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-accel-buffering"] == "no"
    assert response.headers["connection"] == "keep-alive"

    # Starlette wraps a sync iterator in iterate_in_threadpool at construction.
    iterator = response.body_iterator
    assert await anext(iterator) == "retry: 3000\n\n"
    event, data, event_id = _parse(await anext(iterator))
    assert event == "snapshot"
    assert event_id == 1
    assert json.loads(data or "{}")["id"] == turn["id"]
    await iterator.aclose()


def test_events_unknown_turn_returns_404_before_streaming(client: TestClient) -> None:
    response = client.get("/turns/turn_does_not_exist/events")

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"
