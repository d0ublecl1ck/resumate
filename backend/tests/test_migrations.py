"""Regression guard for the Alembic migration chain on SQLite.

The RBAC migration used raw ``now()`` which SQLite rejects; it was fixed to
``CURRENT_TIMESTAMP``. This test drives the whole chain against a throwaway
SQLite database so a SQLite-incompatible migration fails tests instead of
passing unnoticed.
"""

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
