from fastapi.testclient import TestClient


def _create_fact(client: TestClient, **overrides) -> dict:
    payload = {
        "type": overrides.pop("type", "achievement"),
        "title": overrides.pop("title", "商详页性能优化"),
        "content": overrides.pop("content", "首屏 LCP 从 3.2s 降至 1.4s。"),
        "tags": overrides.pop("tags", ["性能优化"]),
        **overrides,
    }
    response = client.post("/profile/facts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_get_profile_creates_once(client: TestClient) -> None:
    first = client.get("/profile")
    second = client.get("/profile")

    assert first.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["facts"] == []
    assert first.json()["completeness"] == 0


def test_update_basics(client: TestClient) -> None:
    response = client.patch(
        "/profile/basics",
        json={
            "fullName": "张沐",
            "headline": "高级前端工程师",
            "email": "zhangmu@example.com",
            "location": "上海",
            "links": [{"label": "GitHub", "url": "https://github.com/zhangmu"}],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["basics"]["fullName"] == "张沐"
    assert body["basics"]["links"][0]["label"] == "GitHub"
    assert body["completeness"] == 50


def test_new_fact_defaults_to_unverified(client: TestClient) -> None:
    body = _create_fact(client)

    assert body["evidence"]["status"] == "unverified"
    assert body["verifiedAt"] is None
    assert body["confidence"] == 0.5
    assert body["visibility"] == "private"
    assert body["source"] == "手动录入"


def test_explicit_verified_evidence_sets_timestamp(client: TestClient) -> None:
    body = _create_fact(client, evidence={"status": "verified", "label": "季度复盘文档", "downloadable": True})

    assert body["evidence"]["status"] == "verified"
    assert body["verifiedAt"] is not None
    assert body["confidence"] == 0.9


def test_fact_update_and_type_filter(client: TestClient) -> None:
    fact = _create_fact(client)
    _create_fact(client, type="skill", title="TypeScript")

    updated = client.patch(f"/profile/facts/{fact['id']}", json={"title": "性能优化成果", "tags": ["性能", "React"]})
    assert updated.json()["title"] == "性能优化成果"
    assert updated.json()["tags"] == ["性能", "React"]

    skills = client.get("/profile/facts", params={"type": "skill"}).json()
    assert [item["title"] for item in skills] == ["TypeScript"]


def test_missing_fact_returns_not_found(client: TestClient) -> None:
    response = client.get("/profile/facts/fact_missing")

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_delete_fact_returns_resume_references(client: TestClient) -> None:
    fact = _create_fact(client)
    document = {
        "basics": {},
        "sections": [
            {
                "id": "sec_experience",
                "kind": "experience",
                "title": "工作经历",
                "entries": [
                    {
                        "id": "entry_1",
                        "title": "高级前端工程师",
                        "bullets": ["负责核心页面"],
                        "provenance": {"kind": "profile_fact", "label": "商详页性能优化", "factId": fact["id"]},
                    }
                ],
            }
        ],
    }
    resume = client.post(
        "/resumes",
        json={"title": "岗位简历", "templateId": "tpl_classic", "document": document},
    ).json()

    response = client.delete(f"/profile/facts/{fact['id']}")

    assert response.status_code == 200
    impact = response.json()
    assert impact["factId"] == fact["id"]
    assert impact["referencedBy"] == [
        {"resumeId": resume["id"], "resumeTitle": "岗位简历", "versionId": resume["currentVersionId"]}
    ]

    after = client.get("/profile").json()
    assert after["facts"] == []
    assert client.get(f"/resumes/{resume['id']}").status_code == 200
