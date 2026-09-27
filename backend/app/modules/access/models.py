from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PersonalAccessToken(Base):
    """Issued PAT metadata; only the SHA-256 hash of the secret is persisted."""

    __tablename__ = "personal_access_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    scopes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    resources: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    fields: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    purpose: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    token_prefix: Mapped[str] = mapped_column(String(24), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AccessLog(Base):
    """Append-only audit trail for sensitive access and changes (US-13.5)."""

    __tablename__ = "access_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    client_id: Mapped[str] = mapped_column(String(160), nullable=False)
    scope: Mapped[str] = mapped_column(String(80), nullable=False)
    resource: Mapped[str] = mapped_column(String(200), nullable=False)
    purpose: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    result: Mapped[str] = mapped_column(String(16), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
