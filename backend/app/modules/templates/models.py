from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Template(Base):
    """Versioned resume template; publishing and retirement are managed outside this module."""

    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    reference_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    publisher: Mapped[str] = mapped_column(String(120), nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    validation_errors: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
