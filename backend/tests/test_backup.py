from fastapi.testclient import TestClient


def _seed(client: TestClient) -> tuple[dict, dict]:
    client.get("/profile")
    client.patch("/profile/basics", json={"fullName": "张沐", "headline": "高级前端工程师"})
    client.post(
        "/profile/facts",
        json={"type": "achievement", "title": "性能优化", "content": "LCP 3.2s 降至 1.4s", "tags": [], "visibility": "private"},
    )
    resume = client.post("/resumes", json={"title": "高级前端工程师简历", "templateId": "tpl_classic"}).json()
    jd = client.post(
        "/jds",
        json={"role": "高级前端工程师", "company": "美团", "body": "负责核心页面", "tags": []},
    ).json()
    client.put(f"/jds/{jd['id']}/binding", json={"resumeId": resume["id"]})
    return resume, jd


def test_export_contains_all_resource_groups(client: TestClient) -> None:
    resume, jd = _seed(client)

    body = client.get("/backup/export").json()

    assert body["formatVersion"] == "resumate-backup/1.0"
    resources = body["resources"]
    assert [item["id"] for item in resources["resumes"]] == [resume["id"]]
    assert resources["resumeVersions"]
    assert resources["profiles"][0]["facts"]
    assert [item["id"] for item in resources["jobDescriptions"]] == [jd["id"]]


def test_markdown_export_is_readable(client: TestClient) -> None:
    _seed(client)

    response = client.get("/backup/export/markdown")

    assert response.status_code == 200
    assert "Resumate 备份索引" in response.text
    assert "高级前端工程师简历" in response.text


def test_preview_reports_valid_with_mapped_binding(client: TestClient) -> None:
    _seed(client)
    backup = client.get("/backup/export").json()

    preview = client.post("/backup/import:preview", json=backup).json()

    assert preview["status"] == "valid"
    assert preview["manifest"]["resourceCounts"]["resumes"] == 1
    assert preview["bindingRestores"][0]["status"] == "mapped"
    assert preview["missingReferences"] == []
    assert preview["idMappings"]


def test_preview_flags_missing_reference(client: TestClient) -> None:
    _seed(client)
    backup = client.get("/backup/export").json()
    backup["resources"]["jobDescriptions"][0]["boundResumeId"] = "resume_missing"

    preview = client.post("/backup/import:preview", json=backup).json()

    assert preview["status"] == "has_issues"
    assert preview["bindingRestores"][0]["status"] == "unmapped"
    assert any("绑定" in item for item in preview["missingReferences"])


def test_invalid_format_is_rejected(client: TestClient) -> None:
    response = client.post("/backup/import:preview", json={"formatVersion": "nope", "resources": {}})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_import_creates_new_resources_and_remaps_ids(client: TestClient) -> None:
    resume, jd = _seed(client)
    backup = client.get("/backup/export").json()

    result = client.post("/backup/import", json=backup).json()

    expected_versions = len(backup["resources"]["resumeVersions"])
    assert result["imported"] == {"resumes": 1, "versions": expected_versions, "profiles": 1, "facts": 1, "jds": 1}
    assert result["bindingRestores"][0]["status"] == "mapped"
    new_ids = {mapping["newId"] for mapping in result["idMappings"]}
    assert resume["id"] not in new_ids
    assert jd["id"] not in new_ids

    resumes = client.get("/resumes").json()
    assert len(resumes) == 2
    imported = next(item for item in resumes if item["id"] != resume["id"])
    versions = client.get(f"/resumes/{imported['id']}/versions").json()
    assert imported["currentVersionId"] in {version["id"] for version in versions}

    jds = client.get("/jds").json()
    imported_jd = next(item for item in jds if item["id"] != jd["id"])
    assert imported_jd["boundResumeId"] == imported["id"]
