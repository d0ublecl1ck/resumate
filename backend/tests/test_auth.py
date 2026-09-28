from fastapi.testclient import TestClient

from app.tasks.seed import seed_admin

import support


def _register(client: TestClient, email: str = "zhang@example.com", password: str = "password123", name: str = "张沐"):
    """Register and complete email verification, leaving the client logged in."""
    return support.register_verified(client, email=email, password=password, name=name)


def _login(client: TestClient, email: str, password: str):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_verify_email_sets_httponly_cookie_and_returns_profile(session_clients) -> None:
    client = session_clients()
    support.register(client)

    response = support.verify(client, support.MAILER.latest_token())

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == "zhang@example.com"
    assert body["role"] == "user"
    assert body["isBanned"] is False
    cookie = response.headers["set-cookie"].lower()
    assert "resumate_session=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert client.get("/auth/me").status_code == 200


def test_duplicate_verified_email_returns_conflict(session_clients) -> None:
    client = session_clients()
    _register(client)

    response = support.register(client, name="另一个人")

    assert response.status_code == 409
    assert response.json()["code"] == "EMAIL_ALREADY_REGISTERED"


def test_login_rejects_wrong_password(session_clients) -> None:
    client = session_clients()
    _register(client)
    client.post("/auth/logout")

    response = _login(client, "zhang@example.com", "wrong-password")

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"


def test_me_requires_session(session_clients) -> None:
    client = session_clients()

    response = client.get("/auth/me")

    assert response.status_code == 401
    assert response.json()["code"] == "UNAUTHENTICATED"


def test_logout_deletes_redis_key_immediately(session_clients, fake_redis) -> None:
    client = session_clients()
    _register(client)
    assert fake_redis.keys("auth:session:*")

    assert client.post("/auth/logout").status_code == 204

    assert fake_redis.keys("auth:session:*") == []
    assert client.get("/auth/me").status_code == 401


def test_protected_business_endpoint_requires_login(session_clients) -> None:
    client = session_clients()

    assert client.get("/resumes").status_code == 401


def test_registered_user_can_access_business_endpoint(session_clients) -> None:
    client = session_clients()
    _register(client)

    response = client.get("/resumes")

    assert response.status_code == 200
    assert response.json() == []


def test_seeded_admin_can_log_in(session_clients, db_session) -> None:
    seed_admin(db_session)
    client = session_clients()

    response = _login(client, "admin@resumate.dev", "resumate-admin")

    assert response.status_code == 200, response.text
    assert response.json()["role"] == "super_admin"


def test_change_password_revokes_every_session(session_clients, fake_redis) -> None:
    client = session_clients()
    _register(client)

    response = client.post(
        "/auth/password",
        json={"currentPassword": "password123", "newPassword": "newpassword456"},
    )

    assert response.status_code == 204
    assert fake_redis.keys("auth:session:*") == []
    assert client.get("/auth/me").status_code == 401
    assert _login(client, "zhang@example.com", "password123").status_code == 401
    assert _login(client, "zhang@example.com", "newpassword456").status_code == 200


def test_change_password_rejects_wrong_current_password(session_clients) -> None:
    client = session_clients()
    _register(client)

    response = client.post(
        "/auth/password",
        json={"currentPassword": "wrong-password", "newPassword": "newpassword456"},
    )

    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"
    assert client.get("/auth/me").status_code == 200


def test_admin_ban_kills_sessions_and_blocks_login(session_clients, db_session, fake_redis) -> None:
    seed_admin(db_session)
    victim = session_clients()
    _register(victim, email="victim@example.com")
    victim_id = victim.get("/auth/me").json()["id"]
    assert fake_redis.exists(f"auth:user_sessions:{victim_id}") == 1

    admin = session_clients()
    assert _login(admin, "admin@resumate.dev", "resumate-admin").status_code == 200
    response = admin.post(f"/auth/users/{victim_id}/ban", json={"reason": "违规"})

    assert response.status_code == 200
    assert response.json()["isBanned"] is True
    assert fake_redis.exists(f"auth:user_sessions:{victim_id}") == 0
    assert victim.get("/auth/me").status_code == 401
    blocked = _login(victim, "victim@example.com", "password123")
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "ACCOUNT_BANNED"


def test_non_admin_cannot_ban(session_clients) -> None:
    client = session_clients()
    _register(client)

    response = client.post("/auth/users/user_admin/ban", json={"reason": "x"})

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


def test_admin_cannot_ban_self(session_clients, db_session) -> None:
    seed_admin(db_session)
    admin = session_clients()
    _login(admin, "admin@resumate.dev", "resumate-admin")

    response = admin.post("/auth/users/user_admin/ban", json={"reason": "x"})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_invalid_email_returns_localized_validation_error(session_clients) -> None:
    client = session_clients()

    response = client.post("/auth/register", json={"email": "abc", "password": "password123", "displayName": "张沐"})

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert "email address" not in body["message"]
    assert "请求参数校验失败" in body["message"]
