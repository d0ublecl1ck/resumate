from fastapi.testclient import TestClient


def test_list_templates_returns_seeded_reference_data(client: TestClient) -> None:
    response = client.get("/templates")

    assert response.status_code == 200
    payload = response.json()
    assert {item["id"] for item in payload} >= {"tpl_classic", "tpl_modern"}
    classic = next(item for item in payload if item["id"] == "tpl_classic")
    assert classic["publishedAt"] is not None
    assert classic["referenceCount"] == 0


def test_get_template_returns_contract_fields(client: TestClient) -> None:
    response = client.get("/templates/tpl_classic")

    assert response.status_code == 200
    assert response.json()["name"] == "经典单栏"


def test_missing_template_returns_machine_error_code(client: TestClient) -> None:
    response = client.get("/templates/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {"code": "RESOURCE_NOT_FOUND", "message": "模板 does-not-exist 不存在"}
