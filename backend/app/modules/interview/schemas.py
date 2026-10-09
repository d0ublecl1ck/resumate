from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.shared.schemas import ApiModel

SessionStatus = Literal["active", "completed"]
ContentDimension = Literal["correctness", "depth", "rigor", "fit"]

# 面试出题的四类题型与题库（bank）对齐；历史数据里的 situational 与 scenario 同义，
# 读取端仍按原值展示，输入筛选统一归一为 scenario。
QuestionKind = Literal["technical", "deep_dive", "scenario", "behavioral"]
QuestionDifficulty = Literal["easy", "medium", "hard"]
# 模型可返回的题型：四类新题型 + 历史 situational（不迁移旧数据）。
QUESTION_KINDS: tuple[str, ...] = ("technical", "deep_dive", "scenario", "behavioral")
LEGACY_KIND_ALIASES = {"situational": "scenario"}


def normalise_kinds(value: list[str] | None) -> list[str]:
    """把输入题型收敛成去重后的 canonical 列表；空列表 = 不限（返回空）。"""
    if not value:
        return []
    kinds: list[str] = []
    for entry in value:
        raw = entry.strip().lower() if isinstance(entry, str) else ""
        canonical = LEGACY_KIND_ALIASES.get(raw, raw)
        if canonical not in QUESTION_KINDS:
            raise ValueError(f"不支持的题型：{entry}")
        if canonical not in kinds:
            kinds.append(canonical)
    return kinds


class InterviewSessionCreate(ApiModel):
    """POST /interview/sessions：选定简历版本 + 目标 JD + 岗位。

    difficulty / kinds 可选：不传 = 现状行为（不限）。kinds 接受历史别名
    situational，落库前归一为 scenario；空数组等同不传。
    """

    resume_version_id: str = Field(min_length=1, max_length=64)
    jd_id: str = Field(min_length=1, max_length=64)
    role: str = Field(min_length=1, max_length=200)
    question_count: int = Field(default=4, ge=3, le=5)
    difficulty: QuestionDifficulty | None = None
    kinds: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("resume_version_id", "jd_id", "role")
    @classmethod
    def _require_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("简历版本、目标 JD 与岗位不能为空")
        return stripped

    @field_validator("kinds")
    @classmethod
    def _clean_kinds(cls, value: list[str]) -> list[str]:
        return normalise_kinds(value)


class InterviewSessionRegenerate(ApiModel):
    """POST /interview/sessions/{id}/regenerate 的可选筛选。

    difficulty / kinds 都不传时沿用会话建场时冻结的筛选；两者都是 None/空
    表示沿用，显式传空数组在语义上等同于「不筛选」——为避免覆盖已存筛选，
    这里把空数组视为未提供。
    """

    difficulty: QuestionDifficulty | None = None
    kinds: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("kinds")
    @classmethod
    def _clean_kinds(cls, value: list[str]) -> list[str]:
        return normalise_kinds(value)


class InterviewGenerationFilters(ApiModel):
    """会话冻结的出题筛选：kinds 空数组表示不限，difficulty None 表示不限。"""

    difficulty: QuestionDifficulty | None = None
    kinds: list[str] = Field(default_factory=list)


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
    # 生成时的难度（easy/medium/hard）；历史题或不限难度时为 null。
    difficulty: QuestionDifficulty | None = None
    # 知识库检索命中的出处（与 bank 的 knowledge_refs 同构）；未命中为空数组。
    knowledge_refs: list[str] = Field(default_factory=list)
    parent_question_id: str | None = None
    answer: InterviewAnswerView | None = None

    @field_validator("knowledge_refs", mode="before")
    @classmethod
    def _coerce_refs(cls, value: object) -> object:
        # 数据库里 knowledge_refs 允许为 NULL，对外统一收敛成空数组。
        return [] if value is None else value


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
    # 建场/重新生成时冻结的筛选条件；None 表示不限。
    filters: InterviewGenerationFilters | None = None
    questions: list[InterviewQuestionView] = Field(default_factory=list)
    report: InterviewReportView | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class InterviewSessionSummary(ApiModel):
    id: str
    status: SessionStatus
    role: str
    rubric_version: str = ""
    question_count: int
    answered_count: int
    # 题型构成（不含 follow_up），用于历史记录卡片的口径展示。
    question_kinds: dict[str, int] = Field(default_factory=dict)
    resume_title: str
    has_report: bool
    # 有报告时给出四维分数与四维平均分（0-100 整数，按四舍五入）；无报告为 null。
    dimension_scores: list[InterviewReportScore] = Field(default_factory=list)
    average_score: int | None = None
    created_at: datetime
    completed_at: datetime | None = None


class InterviewAnswerResult(ApiModel):
    answer: InterviewAnswerView
    follow_up_question: InterviewQuestionView | None = None


# --------------------------------------------------------------------------- #
# 成长曲线 / 口径比较 / 练习项 / 准备洞察
# --------------------------------------------------------------------------- #

# 口径校验的稳定机器码；前端据此决定连线还是并列展示。
CALIBER_SAME = "SAME_CALIBER"
CALIBER_ROLE_MISMATCH = "ROLE_MISMATCH"
CALIBER_RUBRIC_MISMATCH = "RUBRIC_VERSION_MISMATCH"
CALIBER_ROLE_AND_RUBRIC_MISMATCH = "ROLE_AND_RUBRIC_MISMATCH"


class InterviewCaliberView(ApiModel):
    """口径 = 岗位 + 量表版本；只有两者都一致才允许连线。"""

    key: str
    role: str
    rubric_version: str
    session_count: int


class InterviewGrowthPoint(ApiModel):
    session_id: str
    role: str
    rubric_version: str
    correctness: int | None = None
    depth: int | None = None
    rigor: int | None = None
    fit: int | None = None
    # 四维中非空分数的平均，按四舍五入取整；全空时为 null。
    average: int | None = None
    created_at: datetime


class InterviewDimensionAverages(ApiModel):
    correctness: float | None = None
    depth: float | None = None
    rigor: float | None = None
    fit: float | None = None
    overall: float | None = None


class InterviewGrowthSeries(ApiModel):
    caliber: InterviewCaliberView
    points: list[InterviewGrowthPoint] = Field(default_factory=list)
    averages: InterviewDimensionAverages


class InterviewGrowthView(ApiModel):
    role: str | None = None
    primary_caliber_key: str | None = None
    calibers: list[InterviewCaliberView] = Field(default_factory=list)
    series: list[InterviewGrowthSeries] = Field(default_factory=list)
    total_sessions: int = 0


class InterviewComparisonSession(ApiModel):
    id: str
    role: str
    rubric_version: str
    average: int | None = None
    scores: list[InterviewReportScore] = Field(default_factory=list)
    question_count: int
    answered_count: int
    created_at: datetime


class InterviewComparisonView(ApiModel):
    a: InterviewComparisonSession
    b: InterviewComparisonSession
    # 同岗位且同量表才为 true；否则只并列展示。
    connectable: bool
    same_role: bool
    same_rubric_version: bool
    reason: str


class PracticeItemView(ApiModel):
    id: str
    role: str
    dimension: ContentDimension
    goal: str = ""
    material: str = ""
    status: str = "active"
    source_report_id: str
    source_session_id: str
    rubric_version: str
    retest_session_id: str | None = None
    created_at: datetime
    updated_at: datetime


class PracticeItemCreate(ApiModel):
    """POST /interview/practice-items：把某份报告的建议落成练习项。

    dimension 省略时对该报告所有薄弱维度建项；指定时只建该维度。
    """

    report_id: str = Field(min_length=1, max_length=64)
    dimension: ContentDimension | None = None


class PracticeItemUpdate(ApiModel):
    goal: str | None = Field(default=None, max_length=2000)
    status: Literal["active", "done"] | None = None


class PracticeItemRetestResult(ApiModel):
    item: PracticeItemView
    session: InterviewSessionDetail


class InterviewInsightsView(ApiModel):
    resume_version_id: str
    jd_id: str
    match_points: list[str] = Field(default_factory=list)
    risk_points: list[str] = Field(default_factory=list)
    scope_keywords: list[str] = Field(default_factory=list)
