import hashlib

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.access.models import PersonalAccessToken


def test_create_token_returns_secret_once_and_stores_hash(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/access/tokens",
        json={"name": "本地 MCP 客户端", "scopes": ["profile:read", "resume:write"], "purpose": "在编辑器里生成岗位简历"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["secretOnce"].startswith("rsm_pat_")
    assert body["status"] == "active"

    listing = client.get("/access/tokens").json()
    assert listing[0]["id"] == body["id"]
    assert listing[0]["secretOnce"] is None

    row = db_session.scalar(select(PersonalAccessToken))
    assert row is not None
    assert row.token_hash == hashlib.sha256(body["secretOnce"].encode("utf-8")).hexdigest()
    assert body["secretOnce"] not in row.token_hash


def test_revoke_is_idempotent_and_audited(client: TestClient) -> None:
    created = client.post("/access/tokens", json={"name": "导出脚本", "scopes": ["resume:read"]}).json()

    first = client.post(f"/access/tokens/{created['id']}/revoke")
    second = client.post(f"/access/tokens/{created['id']}/revoke")

    assert first.status_code == 200
    assert first.json()["status"] == "revoked"
    assert second.status_code == 200
    assert second.json()["status"] == "revoked"

    purposes = [log["purpose"] for log in client.get("/access/logs").json()]
    assert purposes.count("token_create") == 1
    assert purposes.count("token_revoke") == 1


def test_unknown_scope_is_rejected(client: TestClient) -> None:
    response = client.post("/access/tokens", json={"name": "越权", "scopes": ["admin:all"]})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_revoke_missing_token_returns_not_found(client: TestClient) -> None:
    response = client.post("/access/tokens/pat_missing/revoke")

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_capability_discovery(client: TestClient) -> None:
    body = client.get("/.well-known/resume-agent").json()

    assert body["contractVersion"] == "v0.4"
    assert "backup.export" in body["capabilities"]
    assert body["wellKnownUrl"].endswith("/.well-known/resume-agent")
