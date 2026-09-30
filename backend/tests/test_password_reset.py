"""End-to-end password reset by emailed one-time link (issue b5586).

Mirrors test_email_verification.py: the token never reaches the client, so the
outgoing mail is captured through the shared FakeMailer.
"""

import time

import support


def _verified_user(client, email: str = "reset@example.com", password: str = support.DEFAULT_PASSWORD):
    response = support.register_verified(client, email=email, password=password)
    assert response.status_code == 200, response.text
    return response


def test_forgot_password_is_always_202_and_silent_for_unknown_email(session_clients) -> None:
    client = session_clients()

    response = support.forgot_password(client, "nobody@example.com")

    assert response.status_code == 202, response.text
    assert response.json()["status"] == "reset_sent"
    assert response.json()["email"] == "nobody@example.com"
    assert support.MAILER.mails("password_reset") == []


def test_forgot_password_does_not_reveal_whether_the_account_exists(session_clients) -> None:
    client = session_clients()
    _verified_user(client, email="reset@example.com")

    known = support.forgot_password(client, "reset@example.com")
    unknown = support.forgot_password(client, "nobody@example.com")

    assert known.status_code == unknown.status_code == 202
    assert known.json()["status"] == unknown.json()["status"] == "reset_sent"
    assert set(known.json()) == set(unknown.json()) == {"status", "email"}


def test_forgot_password_mails_a_reset_link_without_touching_the_credential(session_clients, db_session) -> None:
    client = session_clients()
    _verified_user(client, email="reset@example.com", password="old-password-1")

    response = support.forgot_password(client, "reset@example.com")

    assert response.status_code == 202, response.text
    mails = support.MAILER.mails("password_reset")
    assert len(mails) == 1
    assert mails[0]["to"] == "reset@example.com"
    assert "/reset-password?token=" in mails[0]["link"]

    from app.modules.auth import dao
    from app.modules.auth.security import verify_password

    user = dao.get_user_by_email(db_session, "reset@example.com")
    assert verify_password("old-password-1", user.password_hash)


def test_forgot_password_ignores_the_request_inside_the_cooldown(session_clients) -> None:
    client = session_clients()
    _verified_user(client, email="reset@example.com")

    assert support.forgot_password(client, "reset@example.com").status_code == 202
    second = support.forgot_password(client, "reset@example.com")

    assert second.status_code == 202
    assert len(support.MAILER.mails("password_reset")) == 1


def test_forgot_password_stops_mailing_past_the_hourly_quota(session_clients, monkeypatch) -> None:
    from app.modules.auth import service

    settings = service.get_settings().model_copy(
        update={"password_reset_resend_cooldown_seconds": 0, "password_reset_max_sends_per_hour": 2}
    )
    monkeypatch.setattr(service, "get_settings", lambda: settings)

    client = session_clients()
    _verified_user(client, email="reset@example.com")

    for _ in range(4):
        assert support.forgot_password(client, "reset@example.com").status_code == 202

    assert len(support.MAILER.mails("password_reset")) == 2


def test_reset_password_uses_the_new_credential_and_revokes_every_session(session_clients, db_session) -> None:
    client = session_clients()
    _verified_user(client, email="reset@example.com", password="old-password-1")

    second = session_clients()
    assert support.login(second, "reset@example.com", "old-password-1").status_code == 200
    assert client.get("/auth/me").status_code == 200
    assert second.get("/auth/me").status_code == 200

    support.forgot_password(client, "reset@example.com")
    response = support.reset_password(client, support.MAILER.latest_token("password_reset"), "new-password-2")

    assert response.status_code == 204, response.text
    assert client.get("/auth/me").status_code == 401
    assert second.get("/auth/me").status_code == 401
    assert support.login(client, "reset@example.com", "old-password-1").status_code == 401
    assert support.login(client, "reset@example.com", "new-password-2").status_code == 200

    from app.modules.auth import dao
    from app.modules.auth.security import verify_password

    assert verify_password("new-password-2", dao.get_user_by_email(db_session, "reset@example.com").password_hash)


def test_reset_token_is_single_use(session_clients) -> None:
    client = session_clients()
    _verified_user(client, email="reset@example.com")
    support.forgot_password(client, "reset@example.com")
    token = support.MAILER.latest_token("password_reset")

    assert support.reset_password(client, token, "new-password-2").status_code == 204

    replay = support.reset_password(client, token, "another-password-3")
    assert replay.status_code == 400
    assert replay.json()["code"] == "PASSWORD_RESET_TOKEN_INVALID"
    assert "重置" in replay.json()["message"]


def test_reset_token_expires(session_clients, fake_redis) -> None:
    client = session_clients()
    _verified_user(client, email="reset@example.com")
    support.forgot_password(client, "reset@example.com")
    token = support.MAILER.latest_token("password_reset")

    keys = [key for key in fake_redis.scan_iter("auth:password_reset:*") if "lookup" not in key]
    assert len(keys) == 1
    fake_redis.pexpire(keys[0], 1)
    time.sleep(0.02)

    response = support.reset_password(client, token, "new-password-2")

    assert response.status_code == 400
    assert response.json()["code"] == "PASSWORD_RESET_TOKEN_INVALID"


def test_reset_rejects_an_unknown_token(session_clients) -> None:
    client = session_clients()

    response = support.reset_password(client, "not-a-real-token", "new-password-2")

    assert response.status_code == 400
    assert response.json()["code"] == "PASSWORD_RESET_TOKEN_INVALID"


def test_reset_rejects_the_current_password_and_keeps_the_link_usable(session_clients) -> None:
    client = session_clients()
    _verified_user(client, email="reset@example.com", password="old-password-1")
    support.forgot_password(client, "reset@example.com")
    token = support.MAILER.latest_token("password_reset")

    same = support.reset_password(client, token, "old-password-1")

    assert same.status_code == 422
    assert same.json()["code"] == "VALIDATION_FAILED"
    assert "新密码不能与当前密码相同" == same.json()["message"]

    # The rejected attempt must not burn the one-time link.
    assert support.reset_password(client, token, "new-password-2").status_code == 204


def test_reset_enforces_the_shared_password_length_contract(session_clients) -> None:
    client = session_clients()
    _verified_user(client, email="reset@example.com")
    support.forgot_password(client, "reset@example.com")
    token = support.MAILER.latest_token("password_reset")

    response = support.reset_password(client, token, "short")

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"
