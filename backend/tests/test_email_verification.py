"""End-to-end email verification registration and login gate (issue d7b99)."""

import time

from sqlalchemy import func, select

from app.modules.auth import dao
from app.modules.auth.models import User

import support


def _register(client, email: str = "verify@example.com", password: str = "password123", name: str = "验证用户"):
    return support.register(client, email=email, password=password, name=name)


def test_register_returns_202_without_session_and_sends_verification_mail(session_clients, db_session) -> None:
    client = session_clients()

    response = _register(client)

    assert response.status_code == 202, response.text
    body = response.json()
    assert body["status"] == "verification_sent"
    assert body["email"] == "verify@example.com"
    assert "set-cookie" not in response.headers
    assert client.get("/auth/me").status_code == 401

    assert len(support.MAILER.sent) == 1
    link = support.MAILER.sent[0]["link"]
    assert link.startswith("http")
    assert "token=" in link

    user = dao.get_user_by_email(db_session, "verify@example.com")
    assert user is not None
    assert user.email_verified_at is None


def test_verify_token_marks_email_verified_and_issues_session(session_clients, db_session) -> None:
    client = session_clients()
    _register(client)

    response = support.verify(client, support.MAILER.latest_token())

    assert response.status_code == 200, response.text
    assert response.json()["email"] == "verify@example.com"
    assert "resumate_session=" in response.headers["set-cookie"]
    assert client.get("/auth/me").status_code == 200
    assert dao.get_user_by_email(db_session, "verify@example.com").email_verified_at is not None


def test_verify_token_is_single_use(session_clients) -> None:
    client = session_clients()
    _register(client)
    token = support.MAILER.latest_token()

    assert support.verify(client, token).status_code == 200

    replay = support.verify(client, token)
    assert replay.status_code == 400
    assert replay.json()["code"] == "VERIFICATION_TOKEN_INVALID"


def test_verify_token_expires(session_clients, fake_redis) -> None:
    client = session_clients()
    _register(client)
    token = support.MAILER.latest_token()

    keys = list(fake_redis.scan_iter("auth:email_verify:*"))
    assert len(keys) == 1
    fake_redis.pexpire(keys[0], 1)
    time.sleep(0.02)

    response = support.verify(client, token)
    assert response.status_code == 400
    assert response.json()["code"] == "VERIFICATION_TOKEN_INVALID"


def test_login_is_blocked_until_email_verified(session_clients) -> None:
    client = session_clients()
    _register(client)

    blocked = client.post("/auth/login", json={"email": "verify@example.com", "password": "password123"})
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "EMAIL_NOT_VERIFIED"

    support.verify(client, support.MAILER.latest_token())

    assert client.post("/auth/login", json={"email": "verify@example.com", "password": "password123"}).status_code == 200


def test_register_verified_email_still_conflicts(session_clients) -> None:
    client = session_clients()
    support.register_verified(client)

    response = support.register(client, name="另一个人")
    assert response.status_code == 409
    assert response.json()["code"] == "EMAIL_ALREADY_REGISTERED"


def test_resend_verification_respects_cooldown(session_clients) -> None:
    client = session_clients()
    _register(client)

    response = client.post("/auth/verification/resend", json={"email": "verify@example.com"})
    assert response.status_code == 429
    assert response.json()["code"] == "RESEND_TOO_SOON"


def test_register_rate_limit(session_clients, monkeypatch) -> None:
    from app.modules.auth import service

    settings = service.get_settings().model_copy(
        update={
            "email_verification_resend_cooldown_seconds": 0,
            "email_verification_max_sends_per_hour": 2,
        }
    )
    monkeypatch.setattr(service, "get_settings", lambda: settings)

    client = session_clients()
    assert _register(client).status_code == 202
    assert client.post("/auth/verification/resend", json={"email": "verify@example.com"}).status_code == 202

    limited = client.post("/auth/verification/resend", json={"email": "verify@example.com"})
    assert limited.status_code == 429
    assert limited.json()["code"] == "RATE_LIMITED"


def test_register_does_not_duplicate_unverified_user(session_clients, db_session) -> None:
    client = session_clients()
    assert _register(client).status_code == 202

    # The immediate repeat is blocked by the resend cooldown, not by creating a second row.
    assert _register(client).status_code == 429

    count = db_session.scalar(select(func.count()).select_from(User).where(User.email == "verify@example.com"))
    assert count == 1
