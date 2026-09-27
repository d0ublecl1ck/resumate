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


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings()
