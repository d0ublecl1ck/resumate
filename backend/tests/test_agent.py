from fastapi.testclient import TestClient


def _document(section_title: str = "工作经历") -> dict:
    return {
        "basics": {
            "fullName": "张沐",
            "headline": "高级前端工程师",
            "email": "zhangmu@example.com",
            "phone": "",
            "location": "上海",
            "links": [{"label": "GitHub", "url": "https://github.com/zhangmu"}],
        },
        "sections": [
            {
                "id": "sec_experience",
                "kind": "experience",
                "title": section_title,
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
            "entries": [{"id": "entry_p1", "title": "Resumate", "bullets": ["负责 Agent 操作层"]}],
        },
    }


def test_full_access_apply_then_finalize_is_idempotent(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="full_access")
    assert turn["state"] == "open"
    assert turn["executionMode"] == "full_access"
    assert turn["modeSource"] == "session"
    assert turn["baseVersionId"] == resume["currentVersionId"]

    applied = client.post(
        f"/turns/{turn['id']}/patches:apply",
        json={"ops": [_upsert_section_op()], "idempotencyKey": "apply-1"},
    )
    assert applied.status_code == 200, applied.text
    applied_body = applied.json()
    assert applied_body["applied"] is True
    assert applied_body["workingRevision"] == 1
    assert applied_body["pendingActionId"] is None
    assert applied_body["idempotentReplay"] is False

    working = client.get(f"/resumes/{resume['id']}/working-document").json()
    assert working["dirty"] is True
    assert working["workingRevision"] == 1
    assert working["userTurnId"] == turn["id"]
    assert any(section["id"] == "sec_projects" for section in working["document"]["sections"])

    finalize_body = {"idempotencyKey": "finalize-1"}
    first = client.post(f"/turns/{turn['id']}/finalize", json=finalize_body)
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["state"] == "finalized"
    assert first_body["result"]["state"] == "finalized"
    assert first_body["result"]["changeCount"] == 1
    assert first_body["result"]["idempotentReplay"] is False
    version_id = first_body["result"]["versionId"]
    assert version_id.startswith("ver_")

    replay = client.post(f"/turns/{turn['id']}/finalize", json=finalize_body)
    assert replay.status_code == 200, replay.text
    replay_body = replay.json()
    assert replay_body["result"]["versionId"] == version_id
    assert replay_body["result"]["idempotentReplay"] is True

    versions = client.get(f"/resumes/{resume['id']}/versions").json()
    assert len(versions) == 2
    assert versions[-1]["id"] == version_id
    assert versions[-1]["source"] == "agent"

    cleared = client.get(f"/resumes/{resume['id']}/working-document").json()
    assert cleared["dirty"] is False
    assert cleared["workingRevision"] == 0


def test_approval_requires_pending_action(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="approval")

    ops = [{"op": "removeSection", "sectionId": "sec_experience"}]
    preview = client.post(f"/turns/{turn['id']}/patches:preview", json={"ops": ops, "reason": "精简"})
    assert preview.status_code == 200, preview.text
    preview_body = preview.json()
    assert preview_body["valid"] is True
    assert preview_body["requiresConfirmation"] is True
    assert preview_body["diff"][0]["reason"] == "精简"
    pending_id = preview_body["pendingActionId"]
    assert pending_id.startswith("pa_")

    denied = client.post(f"/turns/{turn['id']}/patches:apply", json={"ops": ops, "reason": "精简"})
    assert denied.status_code == 409
    assert denied.json()["code"] == "PENDING_ACTION_NOT_APPROVED"

    approved = client.post(f"/pending-actions/{pending_id}/approve", json={})
    assert approved.status_code == 200, approved.text
    assert approved.json()["state"] == "approved"

    applied = client.post(
        f"/turns/{turn['id']}/patches:apply",
        json={"ops": ops, "reason": "精简", "pendingActionId": pending_id},
    )
    assert applied.status_code == 200, applied.text
    assert applied.json()["pendingActionId"] == pending_id

    actions = client.get(f"/turns/{turn['id']}/pending-actions").json()
    assert actions[0]["id"] == pending_id
    assert actions[0]["state"] == "consumed"

    finalize = client.post(f"/turns/{turn['id']}/finalize", json={})
    assert finalize.status_code == 200, finalize.text
    assert finalize.json()["result"]["versionId"].startswith("ver_")


def test_apply_to_closed_turn_returns_turn_already_closed(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="full_access")
    assert client.post(f"/turns/{turn['id']}/finalize", json={}).status_code == 200

    response = client.post(f"/turns/{turn['id']}/patches:apply", json={"ops": [_upsert_section_op()]})

    assert response.status_code == 409
    assert response.json()["code"] == "TURN_ALREADY_CLOSED"
    assert client.get(f"/turns/{turn['id']}").status_code == 200


def test_finalize_after_manual_commit_returns_base_stale(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="full_access")

    manual = client.put(f"/resumes/{resume['id']}/document", json={"document": _document("项目经历")})
    assert manual.status_code == 200, manual.text
    latest = manual.json()["currentVersionId"]
    assert latest != resume["currentVersionId"]

    response = client.post(f"/turns/{turn['id']}/finalize", json={})

    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "BASE_VERSION_STALE"
    assert body["latestVersionId"] == latest


def test_cancel_settles_applied_changes(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="full_access")
    applied = client.post(f"/turns/{turn['id']}/patches:apply", json={"ops": [_upsert_section_op()]})
    assert applied.status_code == 200, applied.text

    cancelled = client.post(f"/turns/{turn['id']}/cancel", json={"reason": "停止"})
    assert cancelled.status_code == 200, cancelled.text
    body = cancelled.json()
    assert body["state"] == "cancelled"
    assert body["result"]["state"] == "cancelled"
    assert body["result"]["versionId"].startswith("ver_")
    assert body["result"]["message"] == "停止"

    versions = client.get(f"/resumes/{resume['id']}/versions").json()
    assert len(versions) == 2
    assert versions[-1]["source"] == "agent"

    working = client.get(f"/resumes/{resume['id']}/working-document").json()
    assert working["dirty"] is False


def test_cancel_marks_pending_actions_stale(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="approval")
    preview = client.post(
        f"/turns/{turn['id']}/patches:preview",
        json={"ops": [{"op": "removeSection", "sectionId": "sec_experience"}]},
    ).json()

    assert client.post(f"/turns/{turn['id']}/cancel", json={}).status_code == 200

    actions = client.get(f"/turns/{turn['id']}/pending-actions").json()
    assert actions[0]["id"] == preview["pendingActionId"]
    assert actions[0]["state"] == "stale"
    assert actions[0]["staleReason"]


def test_validate_reports_section_not_found(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="full_access")

    response = client.post(
        f"/turns/{turn['id']}/patches:validate",
        json={"ops": [{"op": "removeSection", "sectionId": "sec_missing"}]},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["valid"] is False
    assert body["errors"] == [{"opIndex": 0, "code": "SECTION_NOT_FOUND", "message": "章节 sec_missing 不存在"}]

    # validate has no side effects on the working copy
    working = client.get(f"/resumes/{resume['id']}/working-document").json()
    assert working["dirty"] is False
    assert working["workingRevision"] == 0


def test_noop_patch_finalize_creates_no_empty_version(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="full_access")
    basics = resume["document"]["basics"]
    applied = client.post(
        f"/turns/{turn['id']}/patches:apply",
        json={"ops": [{"op": "setBasics", "basics": basics}]},
    )
    assert applied.status_code == 200, applied.text

    finalize = client.post(f"/turns/{turn['id']}/finalize", json={})

    assert finalize.status_code == 200, finalize.text
    assert finalize.json()["result"]["versionId"] is None
    versions = client.get(f"/resumes/{resume['id']}/versions").json()
    assert len(versions) == 1


def test_begin_closes_previous_open_turn(client: TestClient) -> None:
    resume = _create(client)
    first = _begin(client, resume["id"], executionMode="full_access")
    assert client.post(f"/turns/{first['id']}/patches:apply", json={"ops": [_upsert_section_op()]}).status_code == 200

    second = _begin(client, resume["id"], executionMode="full_access")

    closed = client.get(f"/turns/{first['id']}").json()
    assert closed["state"] == "finalized"
    assert closed["result"]["versionId"].startswith("ver_")
    assert second["baseVersionId"] == closed["result"]["versionId"]
    assert len(client.get(f"/resumes/{resume['id']}/versions").json()) == 2


def test_same_idempotency_key_with_different_payload_conflicts(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="full_access")
    first = client.post(
        f"/turns/{turn['id']}/patches:apply",
        json={"ops": [_upsert_section_op()], "idempotencyKey": "apply-x"},
    )
    assert first.status_code == 200, first.text

    conflict = client.post(
        f"/turns/{turn['id']}/patches:apply",
        json={"ops": [{"op": "removeSection", "sectionId": "sec_experience"}], "idempotencyKey": "apply-x"},
    )

    assert conflict.status_code == 409
    assert conflict.json()["code"] == "IDEMPOTENCY_CONFLICT"


def test_rejected_pending_action_blocks_apply(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="approval")
    ops = [{"op": "removeSection", "sectionId": "sec_experience"}]
    preview = client.post(f"/turns/{turn['id']}/patches:preview", json={"ops": ops}).json()
    pending_id = preview["pendingActionId"]

    rejected = client.post(f"/pending-actions/{pending_id}/reject", json={})
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["state"] == "rejected"

    response = client.post(
        f"/turns/{turn['id']}/patches:apply",
        json={"ops": ops, "pendingActionId": pending_id},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "PENDING_ACTION_NOT_APPROVED"


def test_pending_action_stale_when_payload_differs(client: TestClient) -> None:
    resume = _create(client)
    turn = _begin(client, resume["id"], executionMode="approval")
    ops = [{"op": "removeSection", "sectionId": "sec_experience"}]
    preview = client.post(f"/turns/{turn['id']}/patches:preview", json={"ops": ops}).json()
    pending_id = preview["pendingActionId"]
    assert client.post(f"/pending-actions/{pending_id}/approve", json={}).status_code == 200

    response = client.post(
        f"/turns/{turn['id']}/patches:apply",
        json={"ops": [{"op": "removeSection", "sectionId": "sec_projects"}], "pendingActionId": pending_id},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "PENDING_ACTION_STALE"
