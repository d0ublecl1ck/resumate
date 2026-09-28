"""Shared helpers for the email-verification registration flow (issue d7b99).

The verification token never reaches the client, so tests capture the outgoing
mail through :class:`FakeMailer`; ``conftest`` installs it as the
``get_mailer`` dependency override for every session client.
"""

from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

DEFAULT_PASSWORD = "password123"


class FakeMailer:
    """Collects verification mails instead of contacting SMTP."""

    def __init__(self) -> None:
        self.sent: list[dict[str, str]] = []

    def send_verification_email(self, to: str, link: str) -> None:
        self.sent.append({"to": to, "link": link})

    def latest_token(self) -> str:
        if not self.sent:
            raise AssertionError("没有捕获到任何验证邮件")
        return parse_qs(urlparse(self.sent[-1]["link"]).query)["token"][0]


MAILER = FakeMailer()


def reset_mailer() -> None:
    MAILER.sent.clear()


def get_fake_mailer() -> FakeMailer:
    return MAILER


def register(
    client: TestClient,
    email: str = "zhang@example.com",
    password: str = DEFAULT_PASSWORD,
    name: str = "张沐",
):
    return client.post("/auth/register", json={"email": email, "password": password, "displayName": name})


def verify(client: TestClient, token: str):
    return client.post("/auth/verification/verify", json={"token": token})


def register_verified(
    client: TestClient,
    email: str = "zhang@example.com",
    password: str = DEFAULT_PASSWORD,
    name: str = "张沐",
):
    """Register, consume the mailed token, and return the now-logged-in response."""
    response = register(client, email=email, password=password, name=name)
    assert response.status_code == 202, response.text
    return verify(client, MAILER.latest_token())
