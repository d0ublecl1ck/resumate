from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.shared.schemas import ApiModel

QuizGroup = Literal["objective", "open", "code"]
QuizQuestionKind = Literal["single_choice", "multiple_choice", "true_false", "open", "code"]
QuizAttemptStatus = Literal["in_progress", "submitted"]
QuizVerdict = Literal["correct", "partial", "incorrect", "graded"]
QuizSourceKind = Literal["seed", "bank"]

QUIZ_GROUPS: tuple[str, ...] = ("objective", "open", "code")


class QuizAttemptCreate(ApiModel):
    """POST /quiz/attempts：按岗位与题型分组抽题，每个分组抽一道。"""

    role: str = Field(min_length=1, max_length=200)
    question_types: list[QuizGroup] = Field(default_factory=lambda: list(QUIZ_GROUPS))

    @field_validator("role")
    @classmethod
    def _require_role(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("岗位不能为空")
        return stripped

    @field_validator("question_types")
    @classmethod
    def _clean_types(cls, value: list[QuizGroup]) -> list[QuizGroup]:
        ordered: list[QuizGroup] = []
        for item in value:
            if item not in QUIZ_GROUPS:
                raise ValueError("题型只支持 objective、open、code")
            if item not in ordered:
                ordered.append(item)
        if not ordered:
            raise ValueError("至少选择一种题型")
        return ordered


class QuizAnswerCreate(ApiModel):
    """POST /quiz/attempts/{id}/answers：一次作答，按题型二选一填对应字段。"""

    question_id: str = Field(min_length=1, max_length=64)
    selected_option_ids: list[str] = Field(default_factory=list, max_length=16)
    text_answer: str | None = Field(default=None, max_length=8000)
    code_answer: str | None = Field(default=None, max_length=20000)
    idempotency_key: str | None = Field(default=None, max_length=128)


class QuizOptionView(ApiModel):
    id: str
    text: str


class QuizSourceView(ApiModel):
    kind: QuizSourceKind
    label: str
    version: str


class QuizQuestionView(ApiModel):
    id: str
    group: QuizGroup
    kind: QuizQuestionKind
    ordinal: int
    points: int
    prompt: str
    options: list[QuizOptionView] = Field(default_factory=list)
    reference_points: list[str] = Field(default_factory=list)
    reference_answer: str = ""
    starter_code: str = ""
    source: QuizSourceView


class QuizDimensionScore(ApiModel):
    dimension: str
    score: int | None = None
    evidence: list[str] = Field(default_factory=list)


class QuizAnswerView(ApiModel):
    id: str
    question_id: str
    question_group: QuizGroup
    question_kind: QuizQuestionKind
    selected_option_ids: list[str] = Field(default_factory=list)
    text_answer: str | None = None
    code_answer: str | None = None
    awarded_points: int | None = None
    max_points: int
    verdict: QuizVerdict
    # 代码题：False 表示只做静态评审、未执行任何用户代码；其他题型为 null。
    executed: bool | None = None
    feedback: dict = Field(default_factory=dict)
    created_at: datetime
    graded_at: datetime | None = None


class QuizResultView(ApiModel):
    total_score: int
    max_score: int
    policy: dict = Field(default_factory=dict)
    submitted_at: datetime


class QuizAttemptDetail(ApiModel):
    id: str
    status: QuizAttemptStatus
    role: str
    question_types: list[QuizGroup] = Field(default_factory=list)
    questions: list[QuizQuestionView] = Field(default_factory=list)
    answers: list[QuizAnswerView] = Field(default_factory=list)
    result: QuizResultView | None = None
    max_score: int = 0
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None = None


class QuizAnswerResult(ApiModel):
    answer: QuizAnswerView
