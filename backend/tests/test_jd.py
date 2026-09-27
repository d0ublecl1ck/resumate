from fastapi.testclient import TestClient


def _create_jd(client: TestClient, **overrides) -> dict:
    payload = {
        "role": overrides.pop("role", "高级前端工程师"),
        "body": overrides.pop("body", "负责 C 端核心页面开发与性能优化。"),
        "company": overrides.pop("company", "某科技有限公司"),
        "tags": overrides.pop("tags", ["前端", "性能优化"]),
        **overrides,
    }
    response = client.post("/jds", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _create_resume(client: TestClient, title: str = "岗位简历") -> dict:
    response = client.post(
        "/resumes",
        json={"title": title, "templateId": "tpl_classic", "document": {"basics": {}, "sections": []}},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_jd_starts_at_revision_one(client: TestClient) -> None:
    body = _create_jd(client)

    assert body["revision"] == 1
    assert body["id"].startswith("jd_")
    assert body["boundResumeId"] is None
    assert body["boundResumeAvailable"] is None


def test_create_jd_requires_role_and_body(client: TestClient) -> None:
    response = client.post("/jds", json={"role": "  ", "body": "内容"})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_patch_increments_revision(client: TestClient) -> None:
    created = _create_jd(client)

    response = client.patch(f"/jds/{created['id']}", json={"role": "资深前端工程师"})

    assert response.status_code == 200
    assert response.json()["revision"] == 2
    assert response.json()["role"] == "资深前端工程师"
    assert response.json()["updatedAt"] >= created["updatedAt"]


def test_list_filters_by_query_and_tag(client: TestClient) -> None:
    _create_jd(client, role="前端工程师", company="甲公司", tags=["前端"])
    _create_jd(client, role="后端工程师", company="乙公司", tags=["后端"])

    by_query = client.get("/jds", params={"query": "后端"}).json()
    assert [item["role"] for item in by_query] == ["后端工程师"]

    by_tag = client.get("/jds", params={"tag": "前端"}).json()
    assert [item["role"] for item in by_tag] == ["前端工程师"]


def test_delete_removes_from_management_list(client: TestClient) -> None:
    created = _create_jd(client)

    assert client.delete(f"/jds/{created['id']}").status_code == 204
    assert client.get(f"/jds/{created['id']}").status_code == 404


def test_binding_sets_reverse_reference_on_resume(client: TestClient) -> None:
    jd = _create_jd(client)
    resume = _create_resume(client)

    bound = client.put(f"/jds/{jd['id']}/binding", json={"resumeId": resume["id"]})
    assert bound.status_code == 200
    assert bound.json()["boundResumeId"] == resume["id"]
    assert bound.json()["boundResumeAvailable"] is True

    resume_after = client.get(f"/resumes/{resume['id']}").json()
    assert jd["id"] in resume_after["boundByJdIds"]
    assert len(resume_after["versions"]) == 1


def test_rebinding_replaces_atomically_and_releases(client: TestClient) -> None:
    jd = _create_jd(client)
    first = _create_resume(client, "简历 A")
    second = _create_resume(client, "简历 B")
    client.put(f"/jds/{jd['id']}/binding", json={"resumeId": first["id"]})

    rebound = client.put(f"/jds/{jd['id']}/binding", json={"resumeId": second["id"]})
    assert rebound.json()["boundResumeId"] == second["id"]
    assert jd["id"] not in client.get(f"/resumes/{first['id']}").json()["boundByJdIds"]

    released = client.delete(f"/jds/{jd['id']}/binding")
    assert released.json()["boundResumeId"] is None
    assert released.json()["boundResumeAvailable"] is None


def test_binding_unknown_resume_keeps_previous_binding(client: TestClient) -> None:
    jd = _create_jd(client)
    resume = _create_resume(client)
    client.put(f"/jds/{jd['id']}/binding", json={"resumeId": resume["id"]})

    response = client.put(f"/jds/{jd['id']}/binding", json={"resumeId": "res_missing"})

    assert response.status_code == 404
    assert client.get(f"/jds/{jd['id']}").json()["boundResumeId"] == resume["id"]


def test_binding_deleted_resume_is_rejected(client: TestClient) -> None:
    jd = _create_jd(client)
    resume = _create_resume(client)
    client.delete(f"/resumes/{resume['id']}")

    response = client.put(f"/jds/{jd['id']}/binding", json={"resumeId": resume["id"]})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_deleting_jd_does_not_delete_resume(client: TestClient) -> None:
    jd = _create_jd(client)
    resume = _create_resume(client)
    client.put(f"/jds/{jd['id']}/binding", json={"resumeId": resume["id"]})

    client.delete(f"/jds/{jd['id']}")

    assert client.get(f"/resumes/{resume['id']}").status_code == 200
