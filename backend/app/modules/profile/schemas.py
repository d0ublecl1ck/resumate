from datetime import datetime
from typing import Literal

from pydantic import Field

from app.modules.resume.schemas import Link, ResumeBasics
from app.shared.schemas import ApiModel

FactType = Literal["experience", "project", "skill", "education", "achievement", "certificate"]
FactVisibility = Literal["private", "resume_only", "public"]
EvidenceStatus = Literal["verified", "unverified", "no_evidence"]


class Evidence(ApiModel):
    status: EvidenceStatus
    label: str | None = None
    downloadable: bool | None = None


class FactReference(ApiModel):
    resume_id: str
    resume_title: str
    version_id: str


class ProfileFactCreate(ApiModel):
    type: FactType
    # DB 列是 String(200)；在此拦截超限，让它走 422 VALIDATION_FAILED 而不是数据库 500。
    title: str = Field(max_length=200)
    content: str
    tags: list[str] = Field(default_factory=list)
    evidence: Evidence | None = None
    visibility: FactVisibility = "private"


class ProfileFactUpdate(ApiModel):
    type: FactType | None = None
    # 与 ProfileFactCreate 对齐，更新路径同样不能把超长标题交给数据库。
    title: str | None = Field(default=None, max_length=200)
    content: str | None = None
    tags: list[str] | None = None
    evidence: Evidence | None = None
    visibility: FactVisibility | None = None


class ProfileFactResponse(ApiModel):
    id: str
    type: FactType
    title: str
    content: str
    tags: list[str]
    source: str
    evidence: Evidence
    confidence: float
    verified_at: datetime | None = None
    visibility: FactVisibility
    referenced_by: list[FactReference] = Field(default_factory=list)


class FactDeletionImpact(ApiModel):
    fact_id: str
    referenced_by: list[FactReference] = Field(default_factory=list)


class ProfileBasicsUpdate(ApiModel):
    full_name: str | None = None
    headline: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    links: list[Link] | None = None


class ProfileVersionResponse(ApiModel):
    id: str
    created_at: datetime
    message: str
    fact_count: int


class ProfileResponse(ApiModel):
    id: str
    owner_id: str
    display_name: str
    completeness: int
    basics: ResumeBasics
    facts: list[ProfileFactResponse] = Field(default_factory=list)
    versions: list[ProfileVersionResponse] = Field(default_factory=list)
