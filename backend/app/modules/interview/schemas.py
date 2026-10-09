from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.shared.schemas import ApiModel

SessionStatus = Literal["active", "completed"]
ContentDimension = Literal["correctness", "depth", "rigor", "fit"]


class InterviewSessionCreate(ApiModel):
    """POST /interview/sessions：选定简历版本 + 目标 JD + 岗位。"""

    resume_version_id: str = Field(min_length=1, max_length=64)
    jd_id: str = Field(min_length=1, max_length=64)
    role: str = Field(min_length=1, max_length=200)
    question_count: int = Field(default=4, ge=3, le=5)

    @field_validator("resume_version_id", "jd_id", "role")
    @classmethod
    def _require_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("简历版本、目标 JD 与岗位不能为空")
        return stripped


class InterviewAnswerCreate(ApiModel):
    """POST /interview/sessions/{id}/answers：一次文字作答。

    idempotencyKey 省略时由服务端按 (questionId, content) 派生，保证「同一份作答
    重复提交只落一条记录」不依赖调用方一定带上 key。
    """

    question_id: str = Field(min_length=1, max_length=64)
    content: str = Field(min_length=1, max_length=8000)
    idempotency_key: str | None = Field(default=None, max_length=128)

    @field_validator("question_id", "content")
    @classmethod
    def _require_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("题目标识与作答内容不能为空")
        return stripped


class InterviewContextSnapshot(ApiModel):
    """对外暴露的冻结上下文片段（简历完整快照只落库、不返回）。"""

    role: str
    resume_title: str
    resume_version_id: str
    jd_role: str
    jd_company: str | None = None
    jd_body: str


class InterviewAnswerView(ApiModel):
    id: str
    question_id: str
    content: str
    created_at: datetime


class InterviewQuestionView(ApiModel):
    id: str
    ordinal: int
    kind: str
    prompt: str
    reference_points: list[str] = Field(default_factory=list)
    parent_question_id: str | None = None
    answer: InterviewAnswerView | None = None


class InterviewReportScore(ApiModel):
    dimension: ContentDimension
    # 证据不足时不给分（null），而不是给 0 分。
    score: int | None = None
    evidence: list[str] = Field(default_factory=list)


class InterviewReportView(ApiModel):
    id: str
    session_id: str
    rubric_version: str
    content_scores: list[InterviewReportScore] = Field(default_factory=list)
    summary: str = ""
    highlights: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    created_at: datetime


class InterviewSessionDetail(ApiModel):
    id: str
    status: SessionStatus
    role: str
    resume_id: str
    resume_version_id: str
    jd_id: str
    rubric_version: str
    context_snapshot: InterviewContextSnapshot
    questions: list[InterviewQuestionView] = Field(default_factory=list)
    report: InterviewReportView | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class InterviewSessionSummary(ApiModel):
    id: str
    status: SessionStatus
    role: str
    question_count: int
    answered_count: int
    resume_title: str
    has_report: bool
    created_at: datetime
    completed_at: datetime | None = None


class InterviewAnswerResult(ApiModel):
    answer: InterviewAnswerView
    follow_up_question: InterviewQuestionView | None = None
