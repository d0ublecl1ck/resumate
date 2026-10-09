from datetime import datetime

from sqlalchemy import JSON, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class InterviewSession(Base):
    """一场模拟面试：冻结「简历版本 + 目标 JD + 岗位」上下文快照。

    context_snapshot 在创建时一次性写入，之后不再读取简历/JD 的最新值，
    保证同一场面试的题目、追问与评估都基于同一份冻结上下文（可复现）。
    """

    __tablename__ = "interview_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    resume_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    resume_version_id: Mapped[str] = mapped_column(String(36), nullable=False)
    jd_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(200), nullable=False)
    # active = 可继续作答；completed = 已产出评估报告。
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    rubric_version: Mapped[str] = mapped_column(String(64), nullable=False)
    context_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class InterviewQuestion(Base):
    """一道题：主问题或针对某个回答的追问（parent_question_id 指向主问题）。"""

    __tablename__ = "interview_questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    # technical / deep_dive / scenario / behavioral / follow_up；
    # 历史数据可能仍是 situational（scenario 的旧名）。
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    reference_points: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    # 出题时指定的难度 easy/medium/hard；历史题与不限难度为 NULL。
    difficulty: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 知识库检索命中的出处（与 bank 的 knowledge_refs 同构）；未命中为 NULL。
    knowledge_refs: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    parent_question_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # 追问由哪条作答推导而来，用于幂等重放时返回同一条追问。
    derived_from_answer_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class InterviewAnswer(Base):
    """一条文字作答；(question_id, idempotency_key) 唯一，重复提交只落一条。"""

    __tablename__ = "interview_answers"
    __table_args__ = (
        UniqueConstraint("question_id", "idempotency_key", name="uq_interview_answers_question_idempotency"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    question_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class PracticeItem(Base):
    """练习项：把评估报告的建议落成可执行、可复测的练习。

    (source_report_id, dimension) 唯一：同一份报告的同一维度只落一条，重复
    materialize 幂等。retest_session_id 指向为该项发起的复测场次（可空）。
    """

    __tablename__ = "practice_items"
    __table_args__ = (
        UniqueConstraint("source_report_id", "dimension", name="uq_practice_items_report_dimension"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    dimension: Mapped[str] = mapped_column(String(32), nullable=False)
    goal: Mapped[str] = mapped_column(Text, nullable=False, default="")
    material: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # active = 进行中；done = 已完成。
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    source_report_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    source_session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    rubric_version: Mapped[str] = mapped_column(String(64), nullable=False)
    retest_session_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class InterviewReport(Base):
    """会话结束时冻结的结构化评估；量表版本随报告存储。"""

    __tablename__ = "interview_reports"
    __table_args__ = (UniqueConstraint("session_id", name="uq_interview_reports_session_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False)
    rubric_version: Mapped[str] = mapped_column(String(64), nullable=False)
    # [{"dimension": "correctness", "score": 86|null, "evidence": ["回答原话"]}]
    content_scores: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    highlights: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    gaps: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    suggestions: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
