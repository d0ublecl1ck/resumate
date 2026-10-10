"""Turn listing: preview-only open turns must be discoverable (issue 25573)."""

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.agent.models import AgentTurn


def _document() -> dict:
    return {
        "basics": {"fullName": "示例同学", "headline": "", "email": "", "phone": "", "location": "", "links": []},
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
            "title": "轮次列表测试",
            "templateId": "tpl_classic",
            "targetRole": "测试",
            "tags": [],
            "document": _document(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _begin(client: TestClient, resume_id: str, **body) -> dict:
    response = client.post(f"/resumes/{resume_id}/turns", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def _upsert_section_op() -> dict:
    return {
        "op": "upsertSection",
        "section": {
            "id": "sec_projects",
            "kind": "projects",
            "title": "项目经历",
            "entries": [{"id": "entry_p1", "title": "Resumate", "bullets": ["Agent 操作层"]}],
        },
    }


def _add_turn(db: Session, turn_id: str, owner_id: str, resume_id: str, *, state: str, created_at: datetime) -> None:
    db.add(
        AgentTurn(
            id=turn_id,
            owner_id=owner_id,
            resume_id=resume_id,
            client_id="external",
            source="agent",
            execution_mode="approval",
            mode_source="account",
            state=state,
            base_version_id=None,
            message="",
            result_message="",
            created_at=created_at,
        )
    )
    db.commit()


def test_preview_only_open_turn_is_discoverable(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"])
    preview = client.post(f"/turns/{turn['id']}/patches:preview", json={"ops": [_upsert_section_op()]})
    assert preview.status_code == 200, preview.text
    pending_id = preview.json()["pendingActionId"]

    # The gap: nothing was applied, so working-document cannot point at the turn.
    working = client.get(f"/resumes/{resume['id']}/working-document")
    assert working.status_code == 200, working.text
    assert working.json()["userTurnId"] is None

    listed = client.get(f"/resumes/{resume['id']}/turns", params={"state": "open"})
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert [item["id"] for item in body] == [turn["id"]]
    assert body[0]["state"] == "open"
    assert [action["id"] for action in body[0]["pendingActions"]] == [pending_id]


def test_turn_list_filters_and_orders_newest_first(client: TestClient) -> None:
    resume = _create(client)
    first = _begin(client, resume["id"])
    assert client.post(f"/turns/{first['id']}/finalize", json={}).status_code == 200
    second = _begin(client, resume["id"])

    all_turns = client.get(f"/resumes/{resume['id']}/turns")
    assert all_turns.status_code == 200, all_turns.text
    assert [item["id"] for item in all_turns.json()] == [second["id"], first["id"]]

    open_turns = client.get(f"/resumes/{resume['id']}/turns", params={"state": "open"}).json()
    assert [item["id"] for item in open_turns] == [second["id"]]
    finalized = client.get(f"/resumes/{resume['id']}/turns", params={"state": "finalized"}).json()
    assert [item["id"] for item in finalized] == [first["id"]]


def test_turn_list_is_owner_scoped(client: TestClient, db_session: Session) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"])
    _add_turn(
        db_session,
        "turn_foreign",
        "other_user",
        resume["id"],
        state="open",
        created_at=datetime(2030, 1, 1, tzinfo=timezone.utc),
    )

    listed = client.get(f"/resumes/{resume['id']}/turns", params={"state": "open"}).json()

    assert [item["id"] for item in listed] == [turn["id"]]


def test_turn_list_empty_and_missing_resume(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"])
    assert client.post(f"/turns/{turn['id']}/finalize", json={}).status_code == 200

    empty = client.get(f"/resumes/{resume['id']}/turns", params={"state": "open"})
    assert empty.status_code == 200
    assert empty.json() == []

    missing = client.get("/resumes/res_missing/turns")
    assert missing.status_code == 404
    assert missing.json()["code"] == "RESOURCE_NOT_FOUND"


def test_turn_list_rejects_unknown_state(client: TestClient) -> None:
    resume = _create(client)

    assert client.get(f"/resumes/{resume['id']}/turns", params={"state": "bogus"}).status_code == 422
