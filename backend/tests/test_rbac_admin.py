from fastapi.testclient import TestClient

from app.modules.auth.rbac import PERMISSION_CODES
from app.tasks.seed import seed_admin


def _login_bootstrap(client: TestClient):
    return client.post("/auth/login", json={"email": "admin@resumate.dev", "password": "resumate-admin"})


def _register(client: TestClient, email: str = "member@example.com"):
    return client.post("/auth/register", json={"email": email, "password": "password123", "displayName": "成员"})


def _superclient(session_clients, db_session):
    seed_admin(db_session)
    client = session_clients()
    assert _login_bootstrap(client).status_code == 200
    return client


def test_catalogue_has_20_permissions() -> None:
    # Permission codes are code-owned; there is no online permission creation.
    assert len(PERMISSION_CODES) == 20


def test_super_admin_manages_custom_role(session_clients, db_session) -> None:
    client = _superclient(session_clients, db_session)

    created = client.post(
        "/auth/roles",
        json={"code": "reviewer", "name": "审核员", "description": "只读审核", "permissions": ["resume:read"]},
    )
    assert created.status_code == 201, created.text
    role = created.json()
    assert role["isSystem"] is False
    assert role["permissions"] == ["resume:read"]

    updated = client.patch(f"/auth/roles/{role['id']}", json={"name": "高级审核员", "permissions": ["resume:read", "resume:write"]})
    assert updated.status_code == 200
    assert updated.json()["name"] == "高级审核员"
    assert updated.json()["permissions"] == ["resume:read", "resume:write"]

    assert client.delete(f"/auth/roles/{role['id']}").status_code == 204
    codes = {item["code"] for item in client.get("/auth/roles").json()}
    assert "reviewer" not in codes


def test_system_role_is_read_only(session_clients, db_session) -> None:
    client = _superclient(session_clients, db_session)
    admin_role = next(item for item in client.get("/auth/roles").json() if item["code"] == "admin")

    assert admin_role["isSystem"] is True
    assert client.patch(f"/auth/roles/{admin_role['id']}", json={"name": "x"}).status_code == 422
    assert client.delete(f"/auth/roles/{admin_role['id']}").status_code == 422


def test_role_validation_rejects_bad_code_duplicate_and_unknown_permission(session_clients, db_session) -> None:
    client = _superclient(session_clients, db_session)

    bad_code = client.post("/auth/roles", json={"code": "Bad Code", "name": "x", "permissions": []})
    duplicate = client.post("/auth/roles", json={"code": "user", "name": "x", "permissions": []})
    unknown = client.post("/auth/roles", json={"code": "temp_role", "name": "x", "permissions": ["nope:read"]})

    assert bad_code.status_code == 422
    assert duplicate.status_code == 422
    assert unknown.status_code == 422


def test_delete_role_in_use_is_rejected(session_clients, db_session) -> None:
    client = _superclient(session_clients, db_session)
    member = session_clients()
    _register(member)
    member_id = member.get("/auth/me").json()["id"]
    role = client.post("/auth/roles", json={"code": "temp_role", "name": "临时", "permissions": []}).json()

    assert client.post(f"/auth/users/{member_id}/role", json={"role": "temp_role"}).status_code == 200
    assert client.delete(f"/auth/roles/{role['id']}").status_code == 422

    assert client.post(f"/auth/users/{member_id}/role", json={"role": "user"}).status_code == 200
    assert client.delete(f"/auth/roles/{role['id']}").status_code == 204


def test_permission_catalogue_is_read_only(session_clients, db_session) -> None:
    client = _superclient(session_clients, db_session)
    permissions = client.get("/auth/permissions").json()

    assert permissions
    assert all("isSystem" not in item for item in permissions)
    # The write endpoints must not exist; only the read-only catalogue remains.
    assert client.post("/auth/permissions", json={"code": "report:read", "group": "report", "name": "x"}).status_code == 405
    assert client.patch(f"/auth/permissions/{permissions[0]['id']}", json={"name": "x"}).status_code == 404
    assert client.delete(f"/auth/permissions/{permissions[0]['id']}").status_code == 404
