from datetime import datetime

from pydantic import Field, field_validator

from app.shared.schemas import ApiModel


class JobDescriptionCreate(ApiModel):
    role: str
    body: str
    company: str | None = None
    source_url: str | None = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("role", "body")
    @classmethod
    def _require_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("岗位名称和正文不能为空")
        return stripped


class JobDescriptionUpdate(ApiModel):
    role: str | None = None
    body: str | None = None
    company: str | None = None
    source_url: str | None = None
    tags: list[str] | None = None

    @field_validator("role", "body")
    @classmethod
    def _require_content(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("岗位名称和正文不能为空")
        return stripped


class BindingUpdate(ApiModel):
    resume_id: str


class JobDescriptionResponse(ApiModel):
    id: str
    owner_id: str
    role: str
    company: str | None = None
    body: str
    source_url: str | None = None
    tags: list[str]
    revision: int
    created_at: datetime
    updated_at: datetime
    bound_resume_id: str | None = None
    bound_resume_available: bool | None = None
