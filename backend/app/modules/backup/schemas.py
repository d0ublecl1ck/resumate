from typing import Literal

from pydantic import Field

from app.shared.schemas import ApiModel

SUPPORTED_FORMAT = "resumate-backup/1.0"


class BackupResourceCounts(ApiModel):
    resumes: int = 0
    versions: int = 0
    profiles: int = 0
    facts: int = 0
    jds: int = 0


class BackupAttachment(ApiModel):
    name: str
    downloadable: bool


class BackupManifest(ApiModel):
    format_version: str
    resource_counts: BackupResourceCounts
    attachments: list[BackupAttachment] = Field(default_factory=list)


class BackupNewResource(ApiModel):
    type: str
    title: str


class BackupIdMapping(ApiModel):
    original_id: str
    new_id: str
    type: str


class BindingRestore(ApiModel):
    jd: str
    resume: str
    status: Literal["mapped", "unmapped"]


class ImportPreviewResponse(ApiModel):
    manifest: BackupManifest
    new_resources: list[BackupNewResource]
    id_mappings: list[BackupIdMapping]
    binding_restores: list[BindingRestore]
    missing_references: list[str]
    status: Literal["valid", "has_issues"]


class ImportCounts(ApiModel):
    resumes: int
    versions: int
    profiles: int
    facts: int
    jds: int


class ImportResultResponse(ApiModel):
    imported: ImportCounts
    id_mappings: list[BackupIdMapping]
    binding_restores: list[BindingRestore]
