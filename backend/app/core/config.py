from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "backend"
    database_url: str = "postgresql+psycopg://localhost:5432/resumate"
    # Derives the Fernet key that encrypts stored model API keys. Override in
    # every non-local deployment: rotating it makes existing ciphertext unreadable.
    settings_secret_key: str = "resumate-local-dev-secret"


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide settings instance."""
    return Settings()
