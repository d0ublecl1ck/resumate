from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.templates.models import Template


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


def _create(client: TestClient, **overrides) -> dict:
    payload = {
        "title": overrides.pop("title", "高级前端工程师简历"),
        "templateId": overrides.pop("templateId", "tpl_classic"),
        "targetRole": overrides.pop("targetRole", "高级前端工程师"),
        "tags": overrides.pop("tags", ["前端"]),
        "document": overrides.pop("document", _document()),
        **overrides,
    }
    response = client.post("/resumes", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _retired_template(db_session: Session) -> None:
    db_session.add(
        Template(
            id="tpl_retired",
            name="已下架模板",
            status="retired",
            revision=1,
            reference_count=0,
            publisher="system",
            published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            validation_errors=[],
        )
    )
    db_session.flush()


def test_create_resume_commits_initial_version(client: TestClient) -> None:
    body = _create(client)

    assert body["currentVersionId"].startswith("ver_")
    assert body["lifecycle"] == "active"
    assert body["templateVersion"] == 1
    assert len(body["versions"]) == 1
    assert body["versions"][0]["source"] == "manual"
    assert body["document"]["sections"][0]["title"] == "工作经历"


def test_create_resume_rejects_unknown_template(client: TestClient) -> None:
    response = client.post("/resumes", json={"title": "x", "templateId": "missing"})

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_create_resume_rejects_retired_template(client: TestClient, db_session: Session) -> None:
    _retired_template(db_session)

    response = client.post("/resumes", json={"title": "x", "templateId": "tpl_retired"})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_metadata_patch_does_not_create_version(client: TestClient) -> None:
    created = _create(client)

    response = client.patch(f"/resumes/{created['id']}", json={"title": "改名", "tags": ["前端", "React"]})

    assert response.status_code == 200
    assert response.json()["title"] == "改名"
    assert response.json()["tags"] == ["前端", "React"]
    assert len(response.json()["versions"]) == 1


def test_document_update_creates_new_version(client: TestClient) -> None:
    created = _create(client)
    updated_document = _document(section_title="项目经历")

    response = client.put(
        f"/resumes/{created['id']}/document",
        json={"document": updated_document, "message": "调整章节"},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["versions"]) == 2
    assert body["currentVersionId"] != created["currentVersionId"]
    latest = body["versions"][-1]
    assert latest["message"] == "调整章节"
    assert latest["affectedSections"] == ["项目经历"]
    assert body["document"]["sections"][0]["title"] == "项目经历"


def test_document_update_with_stale_base_returns_conflict(client: TestClient) -> None:
    created = _create(client)

    response = client.put(
        f"/resumes/{created['id']}/document",
        json={"document": _document(), "baseVersionId": "ver_stale"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "BASE_VERSION_STALE"
    assert response.json()["latestVersionId"] == created["currentVersionId"]


def test_draft_update_keeps_committed_document_and_marks_synced_draft(client: TestClient) -> None:
    created = _create(client)
    draft_document = _document(section_title="草稿章节")

    response = client.put(
        f"/resumes/{created['id']}/draft",
        json={"document": draft_document, "baseVersionId": created["currentVersionId"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["saveState"] == "synced_draft"
    assert body["draft"]["sections"][0]["title"] == "草稿章节"
    # 草稿只进缓冲：不生成版本，也不改动已提交文档
    assert len(body["versions"]) == 1
    assert body["currentVersionId"] == created["currentVersionId"]
    assert body["document"]["sections"][0]["title"] == "工作经历"


def test_draft_with_stale_base_returns_conflict(client: TestClient) -> None:
    created = _create(client)

    response = client.put(
        f"/resumes/{created['id']}/draft",
        json={"document": _document(), "baseVersionId": "ver_stale"},
    )

    assert response.status_code == 409
    assert response.json()["code"] == "BASE_VERSION_STALE"
    assert response.json()["latestVersionId"] == created["currentVersionId"]


def test_commit_after_draft_clears_draft_and_creates_version(client: TestClient) -> None:
    created = _create(client)
    draft_document = _document(section_title="草稿章节")
    client.put(
        f"/resumes/{created['id']}/draft",
        json={"document": draft_document, "baseVersionId": created["currentVersionId"]},
    )

    response = client.put(
        f"/resumes/{created['id']}/document",
        json={"document": draft_document, "message": "自动保存", "baseVersionId": created["currentVersionId"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["saveState"] == "committed"
    assert body["draft"] is None
    assert len(body["versions"]) == 2
    assert body["versions"][-1]["message"] == "自动保存"


def test_soft_delete_and_restore(client: TestClient) -> None:
    created = _create(client)

    deleted = client.delete(f"/resumes/{created['id']}").json()
    assert deleted["lifecycle"] == "deleted"
    assert deleted["restoreDeadline"] is not None
    assert all(item["id"] != created["id"] for item in client.get("/resumes").json())

    restored = client.post(f"/resumes/{created['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["lifecycle"] == "active"
    assert restored.json()["restoreDeadline"] is None


def test_archive_and_restore(client: TestClient) -> None:
    created = _create(client)

    archived = client.post(f"/resumes/{created['id']}/archive")
    assert archived.status_code == 200
    assert archived.json()["lifecycle"] == "archived"

    restored = client.post(f"/resumes/{created['id']}/restore")
    assert restored.json()["lifecycle"] == "active"


def test_duplicate_is_independent(client: TestClient) -> None:
    created = _create(client)
    client.put(f"/resumes/{created['id']}/document", json={"document": _document("项目经历")})

    response = client.post(f"/resumes/{created['id']}/duplicate")

    assert response.status_code == 201
    clone = response.json()
    assert clone["id"] != created["id"]
    assert clone["title"].endswith("（副本）")
    assert len(clone["versions"]) == 1
    assert clone["document"]["sections"][0]["title"] == "项目经历"
    original = client.get(f"/resumes/{created['id']}").json()
    assert len(original["versions"]) == 2


def test_list_filters_by_query_and_tag(client: TestClient) -> None:
    _create(client, title="前端简历", tags=["前端"])
    client.post(
        "/resumes",
        json={"title": "后端简历", "targetRole": "后端工程师", "templateId": "tpl_classic", "tags": ["后端"], "document": _document()},
    )

    by_query = client.get("/resumes", params={"query": "后端"}).json()
    assert [item["title"] for item in by_query] == ["后端简历"]

    by_tag = client.get("/resumes", params={"tag": "前端"}).json()
    assert [item["title"] for item in by_tag] == ["前端简历"]


def test_missing_resume_returns_not_found(client: TestClient) -> None:
    response = client.get("/resumes/res_missing")

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"
