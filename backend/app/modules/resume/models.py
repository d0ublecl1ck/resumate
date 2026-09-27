from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Resume(Base):
    """Resume resource: metadata plus the current working document."""

    __tablename__ = "resumes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    profile_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    target_role: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    template_id: Mapped[str] = mapped_column(String(36), nullable=False)
    template_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    current_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    save_state: Mapped[str] = mapped_column(String(32), nullable=False, default="committed")
    document: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    working_document: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    working_base_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    working_turn_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    working_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    restore_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ResumeVersion(Base):
    """Immutable committed content version; snapshot supports fact back-references."""

    __tablename__ = "resume_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    resume_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    change_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    affected_sections: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    parent_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    base_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    committed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
