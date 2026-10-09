from fastapi.testclient import TestClient


def _create_jd(client: TestClient, **overrides) -> dict:
    payload = {
        "role": overrides.pop("role", "高级前端工程师"),
        "company": overrides.pop("company", "某科技公司"),
        "body": overrides.pop(
            "body",
            "负责核心交易链路 C 端前端开发。主导 React 性能优化，首屏加载优化。要求 5 年以上大型 C 端经验。",
        ),
        "tags": overrides.pop("tags", ["前端", "性能优化"]),
        **overrides,
    }
    response = client.post("/jds", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def _create_fact(client: TestClient, **overrides) -> dict:
    payload = {
        "type": overrides.pop("type", "achievement"),
        "title": overrides.pop("title", "商详页性能优化"),
        "content": overrides.pop("content", "主导 React 首屏加载优化，LCP 从 3.2s 降至 1.4s。"),
        "tags": overrides.pop("tags", ["性能优化", "React"]),
        **overrides,
    }
    response = client.post("/profile/facts", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_match_job_is_deterministic_and_reports_facts_and_gaps(client: TestClient) -> None:
    jd = _create_jd(client)
    fact = _create_fact(client)

    first = client.post("/profile/match-job", json={"jdId": jd["id"]})
    second = client.post("/profile/match-job", json={"jdId": jd["id"]})

    assert first.status_code == 200, first.text
    # 纯规则实现：同样的输入必须得到逐字节相同的输出，不依赖任何模型调用。
    assert first.json() == second.json()

    body = first.json()
    assert [item["factId"] for item in body["results"]] == [fact["id"]]
    result = body["results"][0]
    assert result["factTitle"] == "商详页性能优化"
    assert 0 < result["relevance"] <= 1
    assert result["reason"]
    assert result["evidenceStatus"] == "unverified"

    assert body["gaps"], "JD 正文必须被拆成若干要求项"
    statuses = {gap["status"] for gap in body["gaps"]}
    assert "covered" in statuses or "partial" in statuses
    assert statuses <= {"covered", "partial", "missing"}


def test_match_job_ignores_facts_without_overlap(client: TestClient) -> None:
    jd = _create_jd(client)
    relevant = _create_fact(client)
    _create_fact(client, title="咖啡拉花心得", content="周末练习拉花，奶泡更细腻。", tags=["生活"], type="skill")

    body = client.post("/profile/match-job", json={"jdId": jd["id"]}).json()

    assert [item["factId"] for item in body["results"]] == [relevant["id"]]


def test_match_job_without_facts_reports_missing_gaps(client: TestClient) -> None:
    jd = _create_jd(client)

    response = client.post("/profile/match-job", json={"jdId": jd["id"]})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["results"] == []
    assert body["gaps"]
    assert {gap["status"] for gap in body["gaps"]} == {"missing"}
    assert all(gap["requirement"].strip() for gap in body["gaps"])


def test_match_job_missing_jd_returns_not_found(client: TestClient) -> None:
    response = client.post("/profile/match-job", json={"jdId": "jd_missing"})

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_match_job_blank_jd_id_is_rejected_as_422(client: TestClient) -> None:
    response = client.post("/profile/match-job", json={"jdId": ""})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"
