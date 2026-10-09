from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.modules.templates.models import Template

import support


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

def test_restore_version_creates_new_restore_version(client: TestClient) -> None:
    """恢复到历史版本：以 source=restore 生成新版本，历史全部保留。"""
    created = _create(client)
    first_version_id = created["currentVersionId"]
    updated = client.put(
        f"/resumes/{created['id']}/document",
        json={"document": _document(section_title="项目经历"), "message": "调整章节"},
    ).json()
    assert len(updated["versions"]) == 2

    response = client.post(
        f"/resumes/{created['id']}/versions/{first_version_id}/restore",
        json={"message": "恢复到 ver_old"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["document"]["sections"][0]["title"] == "工作经历"
    assert body["currentVersionId"] != updated["currentVersionId"]
    assert [version["source"] for version in body["versions"]] == ["manual", "manual", "restore"]
    assert [version["message"] for version in body["versions"]][-1] == "恢复到 ver_old"
    assert len(body["versions"]) == 3


def test_restore_version_rejects_unknown_version(client: TestClient) -> None:
    created = _create(client)

    response = client.post(f"/resumes/{created['id']}/versions/ver_missing/restore", json={})

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_restore_version_rejects_current_version(client: TestClient) -> None:
    created = _create(client)

    response = client.post(f"/resumes/{created['id']}/versions/{created['currentVersionId']}/restore", json={})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_restore_version_flushes_pending_draft_first(client: TestClient) -> None:
    """恢复前先把手动草稿 flush 成版本，避免恢复吞掉未提交编辑。"""
    created = _create(client)
    first_version_id = created["currentVersionId"]
    client.put(
        f"/resumes/{created['id']}/document",
        json={"document": _document(section_title="项目经历"), "message": "调整章节"},
    )
    client.put(f"/resumes/{created['id']}/draft", json={"document": _document(section_title="草稿章节")})

    response = client.post(f"/resumes/{created['id']}/versions/{first_version_id}/restore", json={})

    assert response.status_code == 200, response.text
    body = response.json()
    messages = [version["message"] for version in body["versions"]]
    assert messages[:3] == ["创建简历", "调整章节", "恢复前保存草稿"]
    assert body["versions"][-1]["source"] == "restore"
    assert body["draft"] is None


# ---------------------------------------------------------------------------
# Markdown 导出（GET /resumes/{id}/export?format=markdown）
# ---------------------------------------------------------------------------


def _register_verified(client: TestClient, email: str) -> None:
    response = support.register_verified(client, email=email, password="password123", name="导出用户")
    assert response.status_code == 200, response.text


def test_export_markdown_returns_attachment_with_sections_and_bullets(client: TestClient) -> None:
    created = _create(client)

    response = client.get(f"/resumes/{created['id']}/export", params={"format": "markdown"})

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/markdown")
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert "filename*=UTF-8''" in disposition
    body = response.text
    assert body.startswith("# 张沐")
    assert "## 工作经历" in body
    assert "### 高级前端工程师" in body
    assert "- 负责核心页面" in body
    assert "zhangmu@example.com" in body


def test_export_markdown_format_defaults_to_markdown(client: TestClient) -> None:
    created = _create(client)

    response = client.get(f"/resumes/{created['id']}/export")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert "## 工作经历" in response.text


def test_export_markdown_encodes_chinese_filename_and_keeps_empty_sections(client: TestClient) -> None:
    document = _document()
    document["sections"].append({"id": "sec_skills", "kind": "skills", "title": "技能", "entries": []})
    created = _create(client, title="张沐的简历", document=document)

    response = client.get(f"/resumes/{created['id']}/export")

    assert response.status_code == 200, response.text
    disposition = response.headers["content-disposition"]
    assert "%E5%BC%A0%E6%B2%90" in disposition  # URL 编码后的「张沐」
    assert "## 技能" in response.text  # 空 section 也要输出标题


def test_export_markdown_falls_back_to_title_when_full_name_empty(client: TestClient) -> None:
    document = _document()
    document["basics"]["fullName"] = ""
    created = _create(client, title="无姓名简历", document=document)

    body = client.get(f"/resumes/{created['id']}/export").text

    assert body.startswith("# 无姓名简历")


def test_export_markdown_rejects_unsupported_format(client: TestClient) -> None:
    created = _create(client)

    response = client.get(f"/resumes/{created['id']}/export", params={"format": "pdf"})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_export_markdown_missing_resume_returns_not_found(client: TestClient) -> None:
    response = client.get("/resumes/res_missing/export")

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_export_markdown_other_owner_returns_not_found(session_clients) -> None:
    owner = session_clients()
    _register_verified(owner, "resume-export-owner@example.com")
    created = _create(owner)

    intruder = session_clients()
    _register_verified(intruder, "resume-export-intruder@example.com")

    response = intruder.get(f"/resumes/{created['id']}/export")

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"
