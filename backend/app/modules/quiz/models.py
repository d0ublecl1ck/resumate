from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class QuizAttempt(Base):
    """一次笔试：抽题时把题目与客观题答案键一起冻结进 questions_snapshot。

    答案键只落库、不下发（service 出题时显式剥离 correctOptionIds），
    保证客观题由服务端确定性判分，前端拿不到答案。status = in_progress | submitted，
    提交后 result 字段（total_score/submitted_at/policy）冻结，重复提交返回同一份结果。
    """

    __tablename__ = "quiz_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="in_progress")
    question_types: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # [{"id","group","kind","ordinal","points","prompt","options","correctOptionIds",...}]
    questions_snapshot: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    max_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 判分口径随笔试冻结存储，便于回看时解释分数。
    policy: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class QuizAnswer(Base):
    """一条作答与其判分结果；(question_id, idempotency_key) 唯一，重复提交只落一条。

    awarded_points / verdict / feedback 在落库前完成判分；开放题与代码题判分失败时
    整条不落库，避免出现「有作答、无结果」的中间态。
    """

    __tablename__ = "quiz_answers"
    __table_args__ = (
        UniqueConstraint("question_id", "idempotency_key", name="uq_quiz_answers_question_idempotency"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    attempt_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    question_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    question_group: Mapped[str] = mapped_column(String(32), nullable=False)
    question_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    answer_payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    awarded_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    verdict: Mapped[str] = mapped_column(String(32), nullable=False)
    feedback: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # 代码题恒为 False（本期不执行任何用户代码）；客观题/开放题为 NULL。
    executed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
