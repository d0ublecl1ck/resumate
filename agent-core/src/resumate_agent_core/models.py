"""Pydantic v2 models for the frozen Agent operation API contract.

These mirror sections 4 (resource model) and 5 (domain patch language) of
docs/agent/agent-operation-api.md exactly. Wire JSON is camelCase; the Python
attributes stay snake_case and pydantic aliases bridge the two. Models only
describe the public REST contract: they contain no database or ORM concepts.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter
from pydantic.alias_generators import to_camel

# --- Enumerated wire values (contract sections 4 and 5) ----------------------

SourceKind: TypeAlias = Literal["agent", "manual", "client"]
ExecutionMode: TypeAlias = Literal["approval", "full_access"]
ModeSource: TypeAlias = Literal["session", "agent", "account"]
TurnState: TypeAlias = Literal["open", "finalized", "cancelled"]
TurnResultState: TypeAlias = Literal["finalized", "cancelled"]
PendingActionKind: TypeAlias = Literal["content_patch"]
PendingActionState: TypeAlias = Literal["pending", "approved", "rejected", "consumed", "stale"]
ChangeType: TypeAlias = Literal["added", "removed", "modified"]
DiffState: TypeAlias = Literal["pending", "accepted", "rejected"]
SectionKind: TypeAlias = Literal[
    "summary", "experience", "projects", "education", "skills", "certificates", "custom"
]
ProvenanceKind: TypeAlias = Literal[
    "profile_fact", "user_input", "jd_snapshot", "agent_generated", "template", "external_client"
]


class ApiModel(BaseModel):
    """Base model that speaks the public API's camelCase wire format."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="ignore",
    )

    def to_wire(self, *, exclude_none: bool = True) -> dict[str, Any]:
        """Serialize to a JSON-ready camelCase mapping for the REST API."""
        return self.model_dump(mode="json", by_alias=True, exclude_none=exclude_none)

    @classmethod
    def from_wire(cls, data: Any) -> "ApiModel":
        """Validate a camelCase (or snake_case) mapping coming from the API."""
        return cls.model_validate(data)


# --- Resume domain documents (embedded in WorkingDocument.document) ---------


class Link(ApiModel):
    """A labelled hyperlink on the resume basics block."""

    label: str
    url: str


class ResumeBasics(ApiModel):
    """The resume header block, replaced wholesale by setBasics."""

    full_name: str = ""
    headline: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    links: list[Link] = Field(default_factory=list)


class Provenance(ApiModel):
    """Where a resume entry's content came from (US-13.4 traceability)."""

    kind: ProvenanceKind
    label: str
    detail: str | None = None
    fact_id: str | None = None


class ResumeEntry(ApiModel):
    """A single item inside a resume section."""

    id: str
    title: str
    subtitle: str | None = None
    period: str | None = None
    location: str | None = None
    bullets: list[str] = Field(default_factory=list)
    provenance: Provenance | None = None


class ResumeSection(ApiModel):
    """A titled resume section holding entries or free text."""

    id: str
    kind: SectionKind
    title: str
    entries: list[ResumeEntry] = Field(default_factory=list)
    text: str | None = None


class ResumeDocument(ApiModel):
    """The full resume document rendered in the working copy."""

    basics: ResumeBasics = Field(default_factory=ResumeBasics)
    sections: list[ResumeSection] = Field(default_factory=list)


# --- Patch language (contract section 5) ------------------------------------


class SetBasicsOp(ApiModel):
    """Replace the whole basics block."""

    op: Literal["setBasics"] = "setBasics"
    basics: ResumeBasics


class UpsertSectionOp(ApiModel):
    """Insert or replace a section, keyed by section.id."""

    op: Literal["upsertSection"] = "upsertSection"
    section: ResumeSection


class RemoveSectionOp(ApiModel):
    """Delete a section by id."""

    op: Literal["removeSection"] = "removeSection"
    section_id: str


class UpsertEntryOp(ApiModel):
    """Insert or replace an entry inside an existing section."""

    op: Literal["upsertEntry"] = "upsertEntry"
    section_id: str
    entry: ResumeEntry


class RemoveEntryOp(ApiModel):
    """Delete an entry from an existing section."""

    op: Literal["removeEntry"] = "removeEntry"
    section_id: str
    entry_id: str


PatchOp: TypeAlias = Annotated[
    SetBasicsOp | UpsertSectionOp | RemoveSectionOp | UpsertEntryOp | RemoveEntryOp,
    Field(discriminator="op"),
]

PATCH_OP_ADAPTER: TypeAdapter[PatchOp] = TypeAdapter(PatchOp)


def validate_patch_op(value: Any) -> Any:
    """Validate a single patch operation, mapping or model, via the union."""
    return PATCH_OP_ADAPTER.validate_python(value)


class PatchValidationError(ApiModel):
    """One machine-readable validation failure from patches:validate."""

    op_index: int
    code: str
    message: str


class PatchRequest(ApiModel):
    """A validated patch proposal; ops must contain at least one operation."""

    ops: list[PatchOp] = Field(min_length=1)
    reason: str = ""
    base_version_id: str | None = None

    @classmethod
    def from_ops(
        cls,
        ops: list[Any],
        *,
        reason: str = "",
        base_version_id: str | None = None,
    ) -> "PatchRequest":
        """Build a request from mixed op models/mappings."""
        return cls(
            ops=[validate_patch_op(op) for op in ops],
            reason=reason,
            base_version_id=base_version_id,
        )


class PatchApplyRequest(ApiModel):
    """Body for patches:apply, including the approval/idempotency fields."""

    ops: list[PatchOp] = Field(min_length=1)
    reason: str | None = None
    base_version_id: str | None = None
    pending_action_id: str | None = None
    idempotency_key: str | None = None


# --- Diff and pending actions (contract sections 4.3 and 6) -----------------


class DiffItem(ApiModel):
    """A single human-readable change shown in a pending-action diff."""

    id: str
    target: str
    change_type: ChangeType
    before: str | None = None
    after: str | None = None
    reason: str
    state: DiffState = "pending"


class PendingAction(ApiModel):
    """A confirmation gate projected for a user turn."""

    id: str
    user_turn_id: str
    kind: PendingActionKind = "content_patch"
    title: str
    target_resource: str
    base_version_id: str | None = None
    impact_summary: str
    requires_text_confirm: bool = False
    state: PendingActionState
    stale_reason: str | None = None
    diff: list[DiffItem] = Field(default_factory=list)
    created_at: datetime
    decided_at: datetime | None = None

    @property
    def approved(self) -> bool:
        """Whether the action may be consumed by an apply call."""
        return self.state == "approved"


# Response alias kept for parity with the contract's naming.
PendingActionResponse = PendingAction


class PatchValidationResponse(ApiModel):
    """Result of patches:validate (no side effects)."""

    valid: bool
    errors: list[PatchValidationError] = Field(default_factory=list)


class PatchPreviewResponse(ApiModel):
    """Result of patches:preview, including the approval projection."""

    valid: bool
    resume_id: str
    base_version_id: str | None = None
    change_count: int = 0
    affected_sections: list[str] = Field(default_factory=list)
    diff: list[DiffItem] = Field(default_factory=list)
    pending_action_id: str | None = None
    requires_confirmation: bool = False


class PatchApplyResponse(ApiModel):
    """Result of patches:apply against the working copy."""

    applied: bool
    user_turn_id: str
    resume_id: str
    change_count: int = 0
    affected_sections: list[str] = Field(default_factory=list)
    working_revision: int = 0
    pending_action_id: str | None = None
    idempotent_replay: bool = False


# --- User turns (contract section 4.1) --------------------------------------


class TurnResult(ApiModel):
    """The settled outcome of a closed turn."""

    state: TurnResultState
    resume_id: str
    version_id: str | None = None
    change_count: int = 0
    affected_sections: list[str] = Field(default_factory=list)
    message: str = ""
    idempotent_replay: bool = False


class UserTurn(ApiModel):
    """A resume-editing turn owned by an external agent or the UI."""

    id: str
    resume_id: str
    client_id: str = "external"
    source: SourceKind = "agent"
    execution_mode: ExecutionMode
    mode_source: ModeSource
    state: TurnState
    base_version_id: str | None = None
    message: str = ""
    created_at: datetime
    closed_at: datetime | None = None
    result: TurnResult | None = None
    pending_actions: list[PendingAction] = Field(default_factory=list)

    @property
    def open(self) -> bool:
        """Whether the turn still accepts writes."""
        return self.state == "open"


UserTurnResponse = UserTurn


class WorkingDocument(ApiModel):
    """The server-side working copy staged by open turns."""

    resume_id: str
    document: ResumeDocument
    base_version_id: str | None = None
    user_turn_id: str | None = None
    working_revision: int = 0
    dirty: bool = False


WorkingDocumentResponse = WorkingDocument


# --- Turn lifecycle request bodies (contract section 6) ---------------------


class CreateTurnRequest(ApiModel):
    """Body for POST /resumes/{resume_id}/turns (every field optional)."""

    base_version_id: str | None = None
    execution_mode: ExecutionMode | None = None
    client_id: str | None = None
    source: SourceKind | None = None
    message: str | None = None


class FinalizeTurnRequest(ApiModel):
    """Body for POST /turns/{turn_id}/finalize."""

    idempotency_key: str | None = None
    message: str | None = None


class CancelTurnRequest(ApiModel):
    """Body for POST /turns/{turn_id}/cancel."""

    idempotency_key: str | None = None
    reason: str | None = None


# --- Capability discovery (C-10 / contract section 1) -----------------------


class CapabilityResponse(ApiModel):
    """Payload of GET /.well-known/resume-agent (never user resources)."""

    contract_version: str
    openapi_url: str
    mcp_url: str
    well_known_url: str
    auth_methods: list[str] = Field(default_factory=list)
    capabilities: list[str] = Field(default_factory=list)
