from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.shared.schemas import ApiModel

BankKind = Literal["technical", "deep_dive", "scenario", "behavioral"]
BankDifficulty = Literal["easy", "medium", "hard"]
BankSource = Literal["seed_model", "import"]

KINDS: tuple[str, ...] = ("technical", "deep_dive", "scenario", "behavioral")
DIFFICULTIES: tuple[str, ...] = ("easy", "medium", "hard")


class BankQuestionImport(ApiModel):
    """POST /bank/import 的数组元素；kind/difficulty 由 Literal 做白名单校验。"""

    role: str = Field(min_length=1, max_length=200)
    kind: BankKind
    difficulty: BankDifficulty
    prompt: str = Field(min_length=1, max_length=4000)
    reference_points: list[str] = Field(default_factory=list, max_length=8)
    knowledge_refs: list[str] | None = Field(default=None, max_length=8)
    source: BankSource = "import"
    batch_id: str | None = Field(default=None, max_length=64)

    @field_validator("role", "prompt")
    @classmethod
    def _require_text(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("岗位与题干不能为空")
        return stripped

    @field_validator("reference_points", "knowledge_refs")
    @classmethod
    def _clean_points(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = [item.strip() for item in value if isinstance(item, str) and item.strip()]
        return cleaned


class BankQuestionView(ApiModel):
    id: str
    role: str
    kind: BankKind
    difficulty: BankDifficulty
    prompt: str
    reference_points: list[str] = Field(default_factory=list)
    knowledge_refs: list[str] = Field(default_factory=list)
    source: BankSource
    created_at: datetime

    @field_validator("reference_points", "knowledge_refs", mode="before")
    @classmethod
    def _coerce_list(cls, value: object) -> object:
        # 数据库里 knowledge_refs 允许为 NULL，对外的视图统一收敛成空数组。
        return [] if value is None else value


class BankRoleStats(ApiModel):
    role: str
    total: int
    kinds: dict[str, int] = Field(default_factory=dict)


class BankStats(ApiModel):
    roles: list[BankRoleStats] = Field(default_factory=list)
    total: int = 0


class BankImportResult(ApiModel):
    created: int
    skipped: int
