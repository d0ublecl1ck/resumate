from datetime import datetime

from sqlalchemy import JSON, DateTime, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class BankQuestion(Base):
    """岗位题库里的一道题；同一岗位内用题干去空白后的 sha256 去重。

    source 记录题目来源（seed_model = 生成脚本产出，import = 外部导入），
    batch_id 记录它属于哪一批生成/导入，便于排查与回滚单批数据。
    """

    __tablename__ = "bank_questions"
    __table_args__ = (
        UniqueConstraint("role", "prompt_hash", name="uq_bank_questions_role_prompt_hash"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    role: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    # technical / deep_dive / scenario / behavioral
    kind: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    # easy / medium / hard
    difficulty: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    reference_points: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    knowledge_refs: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    # seed_model / import
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    batch_id: Mapped[str] = mapped_column(String(64), nullable=False)
    prompt_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
