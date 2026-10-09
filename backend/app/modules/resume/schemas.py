from datetime import datetime
from typing import Literal

from pydantic import Field

from app.shared.schemas import ApiModel

ResumeLifecycle = Literal["active", "archived", "deleted"]
SaveState = Literal["local_unsynced", "synced_draft", "uncommitted", "saving", "committed", "failed", "frozen"]
VersionSource = Literal["manual", "agent", "client", "import", "restore"]
SectionKind = Literal["summary", "experience", "projects", "education", "skills", "certificates", "custom"]


class Link(ApiModel):
    label: str
    url: str


class ResumeBasics(ApiModel):
    full_name: str = ""
    headline: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    links: list[Link] = Field(default_factory=list)


class Provenance(ApiModel):
    kind: Literal["profile_fact", "user_input", "jd_snapshot", "agent_generated", "template", "external_client"]
    label: str
    detail: str | None = None
    fact_id: str | None = None


class ResumeEntry(ApiModel):
    id: str
    title: str
    subtitle: str | None = None
    period: str | None = None
    location: str | None = None
    bullets: list[str] = Field(default_factory=list)
    provenance: Provenance | None = None


class ResumeSection(ApiModel):
    id: str
    kind: SectionKind
    title: str
    entries: list[ResumeEntry] = Field(default_factory=list)
    text: str | None = None


class ResumeDocument(ApiModel):
    basics: ResumeBasics = Field(default_factory=ResumeBasics)
    sections: list[ResumeSection] = Field(default_factory=list)


class ResumeVersionResponse(ApiModel):
    id: str
    source: VersionSource
    actor_id: str
    message: str
    change_count: int
    affected_sections: list[str]
    started_at: datetime
    committed_at: datetime
    parent_version_id: str | None = None
    base_version_id: str | None = None
    client_id: str | None = None
    conversation_id: str | None = None
    user_turn_id: str | None = None
    agent_run_id: str | None = None
    execution_mode: Literal["approval", "full_access"] | None = None


class ResumeResponse(ApiModel):
    id: str
    title: str
    target_role: str
    tags: list[str]
    template_id: str
    template_version: int
    current_version_id: str | None
    lifecycle: ResumeLifecycle
    save_state: SaveState
    updated_at: datetime
    bound_by_jd_ids: list[str] = Field(default_factory=list)
    restore_deadline: datetime | None = None
    profile_id: str | None = None
    document: ResumeDocument
    draft: ResumeDocument | None = None
    versions: list[ResumeVersionResponse] = Field(default_factory=list)


class ResumeCreate(ApiModel):
    title: str
    template_id: str
    target_role: str = ""
    tags: list[str] = Field(default_factory=list)
    profile_id: str | None = None
    document: ResumeDocument | None = None


class ResumeUpdate(ApiModel):
    title: str | None = None
    target_role: str | None = None
    tags: list[str] | None = None
    template_id: str | None = None


class DocumentUpdate(ApiModel):
    document: ResumeDocument
    message: str = ""
    base_version_id: str | None = None


class DraftUpdate(ApiModel):
    """草稿缓冲写入（C-05）：只同步内容，不生成版本。"""

    document: ResumeDocument
    base_version_id: str | None = None


class VersionRestore(ApiModel):
    """恢复到历史版本（C-03）：message 是客户端本地化文案，缺省时服务端兜底。"""

    message: str = ""
