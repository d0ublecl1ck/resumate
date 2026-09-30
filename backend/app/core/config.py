from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "backend"
    database_url: str = "postgresql+psycopg://localhost:5432/resumate"
    # Derives the Fernet key that encrypts stored model API keys. Override in
    # every non-local deployment: rotating it makes existing ciphertext unreadable.
    settings_secret_key: str = "resumate-local-dev-secret"
    redis_url: str = "redis://localhost:6379/0"
    session_ttl_seconds: int = 7 * 24 * 60 * 60
    session_cookie_name: str = "resumate_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    # Bootstrap admin for local development; change the password before deploying.
    bootstrap_admin_email: str = "admin@resumate.dev"
    bootstrap_admin_password: str = "resumate-admin"
    bootstrap_admin_name: str = "管理员"

    # Email verification: registration proves mailbox ownership before any session
    # is issued, so these knobs govern the token lifetime and sending pressure.
    email_verification_token_ttl_seconds: int = 30 * 60
    # How long a token can still be used to ask for a resend after it expired or
    # was consumed; without this the dead-link page has no way back to the address.
    email_verification_lookup_ttl_seconds: int = 7 * 24 * 60 * 60
    email_verification_resend_cooldown_seconds: int = 60
    email_verification_max_sends_per_hour: int = 5

    # Password reset by emailed one-time link; mirrors the verification knobs.
    # The token is shorter-lived because it can change the credential, while the
    # lookup record still lets the API tell a dead link apart from a wrong new
    # password without consuming anything.
    password_reset_token_ttl_seconds: int = 30 * 60
    password_reset_lookup_ttl_seconds: int = 7 * 24 * 60 * 60
    password_reset_resend_cooldown_seconds: int = 60
    password_reset_max_sends_per_hour: int = 5
    # SMTP relay for verification mail. An empty SMTP_HOST disables real sending.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_starttls: bool = True
    # Base URL used to build the verification link that goes into the mail.
    public_web_base_url: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings()
