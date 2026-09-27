from fastapi.testclient import TestClient

from app.tasks.seed import seed_admin


def _register(client: TestClient, email: str = "zhang@example.com", password: str = "password123", name: str = "张沐"):
    return client.post("/auth/register", json={"email": email, "password": password, "displayName": name})


def _login(client: TestClient, email: str, password: str):
    return client.post("/auth/login", json={"email": email, "password": password})


def test_register_creates_session_and_httponly_cookie(session_clients) -> None:
    client = session_clients()

    response = _register(client)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == "zhang@example.com"
    assert body["role"] == "user"
    assert body["isBanned"] is False
    cookie = response.headers["set-cookie"].lower()
    assert "resumate_session=" in cookie
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert client.get("/auth/me").status_code == 200


def test_duplicate_email_returns_conflict(session_clients) -> None:
    client = session_clients()
    _register(client)

    response = _register(client, name="另一个人")

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
    assert response.json()["role"] == "admin"
