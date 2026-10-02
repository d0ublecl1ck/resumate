"""Profile-scoped agent turns and pending actions (issue fef83).

Scope decides what a turn operates on (resume vs profile); ownership still hangs
off the owner and, for profile work, the caller's own session. These cases ride
the stubbed current user unless noted.
"""

from fastapi.testclient import TestClient


def _document() -> dict:
    return {
        "basics": {"fullName": "张沐", "headline": "", "email": "", "phone": "", "location": "", "links": []},
        "sections": [],
    }


def _create_resume(client: TestClient) -> dict:
    response = client.post(
        "/resumes",
        json={
            "title": "作用域测试",
            "templateId": "tpl_classic",
            "targetRole": "测试",
            "tags": [],
            "document": _document(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_session(client: TestClient) -> str:
    response = client.post("/sessions", json={})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _section_op() -> dict:
    return {
        "op": "upsertSection",
        "section": {"id": "sec_scope", "kind": "experience", "title": "经历", "entries": []},
    }


def test_profile_turn_is_created_without_a_resume(client: TestClient) -> None:
    session_id = _create_session(client)

    response = client.post(
        "/turns",
        json={"scope": "profile", "sessionId": session_id, "message": "整理一下我的技能"},
    )

    assert response.status_code == 201, response.text
    turn = response.json()
    assert turn["scope"] == "profile"
    assert turn["resumeId"] is None
    assert turn["sessionId"] == session_id


def test_profile_turn_requires_a_session(client: TestClient) -> None:
    response = client.post("/turns", json={"scope": "profile"})

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_resume_scope_turn_requires_a_resume_id(client: TestClient) -> None:
    response = client.post("/turns", json={"scope": "resume"})

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_resume_path_endpoint_stays_resume_scoped(client: TestClient) -> None:
    resume = _create_resume(client)

    response = client.post(f"/resumes/{resume['id']}/turns", json={})

    assert response.status_code == 201, response.text
    turn = response.json()
    assert turn["scope"] == "resume"
    assert turn["resumeId"] == resume["id"]


def test_resume_patch_flow_rejects_a_profile_turn(client: TestClient) -> None:
    session_id = _create_session(client)
    turn = client.post("/turns", json={"scope": "profile", "sessionId": session_id}).json()

    response = client.post(f"/turns/{turn['id']}/patches:preview", json={"ops": [_section_op()]})

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "VALIDATION_FAILED"
