from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class AgentTurn(Base):
    """One Agent work session against a single resume (C-01 / C-04).

    The execution mode is frozen at creation (C-02); the turn stores the base
    version it started from so working-copy aggregation can detect staleness.
    """

    __tablename__ = "agent_turns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    resume_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String(64), nullable=False, default="external")
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="agent")
    execution_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    mode_source: Mapped[str] = mapped_column(String(32), nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    base_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    message: Mapped[str] = mapped_column(String(1000), nullable=False, default="")
    result_state: Mapped[str | None] = mapped_column(String(32), nullable=True)
    result_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    result_change_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result_affected_sections: Mapped[list | None] = mapped_column(JSON, nullable=True)
    result_message: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    run_state: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    state_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PendingAction(Base):
    """A previewed content patch awaiting approval before it can be applied."""

    __tablename__ = "agent_pending_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    turn_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    resume_id: Mapped[str] = mapped_column(String(36), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="content_patch")
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    base_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    impact_summary: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    requires_text_confirm: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    stale_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ops: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    reason: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    diff: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    change_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    affected_sections: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentOperation(Base):
    """Stored response for an idempotent write (finalize / cancel / apply)."""

    __tablename__ = "agent_operations"
    __table_args__ = (
        UniqueConstraint("turn_id", "kind", "idempotency_key", name="uq_agent_operation_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    turn_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    response: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AgentSession(Base):
    """A conversation grouping agent turns for one owner (issue 9d29a).

    Identity is the owner only: one session can span several resumes, so it
    must not carry a resume_id.
    """

    __tablename__ = "agent_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AgentSessionMessage(Base):
    """One ordered message inside an agent session."""

    __tablename__ = "agent_session_messages"
    __table_args__ = (
        UniqueConstraint("session_id", "seq", name="uq_agent_session_message_seq"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[Any] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
