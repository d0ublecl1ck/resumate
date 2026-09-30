"""Shared helpers for the email-verification registration flow (issue d7b99).

The verification token never reaches the client, so tests capture the outgoing
mail through :class:`FakeMailer`; ``conftest`` installs it as the
``get_mailer`` dependency override for every session client.
"""

from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

DEFAULT_PASSWORD = "password123"


class FakeMailer:
    """Collects verification and password-reset mails instead of contacting SMTP."""

    def __init__(self) -> None:
        self.sent: list[dict[str, str]] = []

    def send_verification_email(self, to: str, link: str) -> None:
        self.sent.append({"kind": "verification", "to": to, "link": link})

    def send_password_reset_email(self, to: str, link: str) -> None:
        self.sent.append({"kind": "password_reset", "to": to, "link": link})

    def latest_token(self, kind: str = "verification") -> str:
        for item in reversed(self.sent):
            if item["kind"] == kind:
                return parse_qs(urlparse(item["link"]).query)["token"][0]
        raise AssertionError(f"没有捕获到任何 {kind} 邮件")

    def mails(self, kind: str) -> list[dict[str, str]]:
        return [item for item in self.sent if item["kind"] == kind]


MAILER = FakeMailer()


def reset_mailer() -> None:
    MAILER.sent.clear()


def get_fake_mailer() -> FakeMailer:
    return MAILER


def register(
    client: TestClient,
    email: str = "zhang@example.com",
    password: str = DEFAULT_PASSWORD,
    name: str = "示例同学",
):
    return client.post("/auth/register", json={"email": email, "password": password, "displayName": name})


def verify(client: TestClient, token: str):
    return client.post("/auth/verification/verify", json={"token": token})


def login(client: TestClient, email: str = "zhang@example.com", password: str = DEFAULT_PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def forgot_password(client: TestClient, email: str = "zhang@example.com"):
    return client.post("/auth/password/forgot", json={"email": email})


def reset_password(client: TestClient, token: str, new_password: str):
    return client.post("/auth/password/reset", json={"token": token, "newPassword": new_password})


def register_verified(
    client: TestClient,
    email: str = "zhang@example.com",
    password: str = DEFAULT_PASSWORD,
    name: str = "示例同学",
):
    """Register, consume the mailed token, and return the now-logged-in response."""
    response = register(client, email=email, password=password, name=name)
    assert response.status_code == 202, response.text
    return verify(client, MAILER.latest_token())
