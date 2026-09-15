"""Application configuration, the single entry point for environment variables."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables and .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "backend"
    database_url: str = "sqlite:///./app.db"


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide cached Settings instance."""

    return Settings()
