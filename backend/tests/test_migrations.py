"""Regression guard for the Alembic migration chain on SQLite.

The RBAC migration used raw ``now()`` which SQLite rejects; it was fixed to
``CURRENT_TIMESTAMP``. This test drives the whole chain against a throwaway
SQLite database so a SQLite-incompatible migration fails tests instead of
passing unnoticed.
"""

from datetime import datetime, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

import app.core.db as core_db

BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = BACKEND_DIR / "migrations"
AGENT_TABLES = ("agent_turns", "agent_pending_actions", "agent_operations")
WORKING_COPY_COLUMNS = (
    "working_document",
    "working_base_version_id",
    "working_turn_id",
    "working_revision",
)


def _config(sqlite_url: str) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    config.set_main_option("sqlalchemy.url", sqlite_url)
    return config


def test_alembic_upgrade_head_on_sqlite(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    database_path = tmp_path / "alembic.sqlite3"
    sqlite_url = f"sqlite:///{database_path}"
    sqlite_engine = create_engine(sqlite_url)
    # migrations/env.py connects through the app engine, so point it at SQLite.
    monkeypatch.setattr(core_db, "engine", sqlite_engine)
    config = _config(sqlite_url)

    command.upgrade(config, "head")

    inspector = inspect(sqlite_engine)
    tables = set(inspector.get_table_names())
    assert set(AGENT_TABLES) <= tables
    resume_columns = {column["name"] for column in inspector.get_columns("resumes")}
    assert set(WORKING_COPY_COLUMNS) <= resume_columns

    # Resolve the latest revision from migrations/versions instead of hardcoding it.
    expected_head = ScriptDirectory.from_config(config).get_current_head()
    with sqlite_engine.connect() as connection:
        applied_head = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert applied_head == expected_head
    sqlite_engine.dispose()


def test_alembic_upgrade_adds_email_verified_at(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    database_path = tmp_path / "alembic-verified.sqlite3"
    sqlite_url = f"sqlite:///{database_path}"
    sqlite_engine = create_engine(sqlite_url)
    monkeypatch.setattr(core_db, "engine", sqlite_engine)
    config = _config(sqlite_url)

    command.upgrade(config, "head")

    users_columns = {column["name"] for column in inspect(sqlite_engine).get_columns("users")}
    assert "email_verified_at" in users_columns
    sqlite_engine.dispose()


def test_email_verified_backfill_marks_existing_users_verified(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    database_path = tmp_path / "alembic-backfill.sqlite3"
    sqlite_url = f"sqlite:///{database_path}"
    sqlite_engine = create_engine(sqlite_url)
    monkeypatch.setattr(core_db, "engine", sqlite_engine)
    config = _config(sqlite_url)

    # b8e4d2f6a1c9 was the head before the email-verification migration; plant a
    # legacy row there so the backfill has something to act on.
    command.upgrade(config, "b8e4d2f6a1c9")
    created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    with sqlite_engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (id, email, display_name, password_hash, is_banned, created_at, updated_at) "
                "VALUES (:id, :email, :display_name, :password_hash, 0, :created_at, :created_at)"
            ),
            {
                "id": "user_legacy",
                "email": "legacy@example.com",
                "display_name": "老用户",
                "password_hash": "hash",
                "created_at": created_at,
            },
        )

    command.upgrade(config, "head")

    with sqlite_engine.connect() as connection:
        verified_at, stored_created_at = connection.execute(
            text("SELECT email_verified_at, created_at FROM users WHERE email = 'legacy@example.com'")
        ).one()
    assert verified_at is not None
    assert verified_at == stored_created_at
    sqlite_engine.dispose()
