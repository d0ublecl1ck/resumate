"""SMTP delivery for verification mail.

Mailer is a Protocol so routes depend on the behavior rather than on SMTP
itself; the test suite overrides the FastAPI dependency with an in-memory fake.
"""

import smtplib
from email.message import EmailMessage
from typing import Protocol

from app.core.config import get_settings


class Mailer(Protocol):
    def send_verification_email(self, to: str, link: str) -> None: ...

    def send_password_reset_email(self, to: str, link: str) -> None: ...


class SmtpMailer:
    """Sends the plain-text verification mail through the configured SMTP relay."""

    def send_verification_email(self, to: str, link: str) -> None:
        settings = get_settings()
        if not settings.smtp_host or not settings.smtp_from_email:
            raise RuntimeError("SMTP 未配置：请设置 SMTP_HOST 与 SMTP_FROM_EMAIL")
        message = EmailMessage()
        message["Subject"] = "验证你的 Resumate 邮箱"
        message["From"] = settings.smtp_from_email
        message["To"] = to
        message.set_content(
            "请点击下面的链接完成邮箱验证：\n\n"
            f"{link}\n\n"
            "如果这不是你本人的操作，忽略这封邮件即可。"
        )
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_starttls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)


    def send_password_reset_email(self, to: str, link: str) -> None:
        settings = get_settings()
        if not settings.smtp_host or not settings.smtp_from_email:
            raise RuntimeError("SMTP 未配置：请设置 SMTP_HOST 与 SMTP_FROM_EMAIL")
        message = EmailMessage()
        message["Subject"] = "重置你的 Resumate 密码"
        message["From"] = settings.smtp_from_email
        message["To"] = to
        message.set_content(
            "请点击下面的链接设置新的登录密码：\n\n"
            f"{link}\n\n"
            "如果这不是你本人的操作，忽略这封邮件即可。"
        )
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            if settings.smtp_starttls:
                server.starttls()
            if settings.smtp_username:
                server.login(settings.smtp_username, settings.smtp_password)
            server.send_message(message)


def get_mailer() -> Mailer:
    """FastAPI dependency; tests override it with a fake."""
    return SmtpMailer()
