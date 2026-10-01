from datetime import datetime
from typing import Annotated, Any, Literal, Union

from pydantic import Field

from app.modules.resume.schemas import ResumeBasics, ResumeDocument, ResumeEntry, ResumeSection
from app.shared.schemas import ApiModel

ExecutionMode = Literal["approval", "full_access"]
ModeSource = Literal["session", "agent", "account"]
TurnSource = Literal["agent", "manual", "client"]
TurnState = Literal["open", "finalized", "cancelled"]
PendingActionState = Literal["pending", "approved", "rejected", "consumed", "stale"]
DiffChangeType = Literal["added", "removed", "modified"]
DiffState = Literal["pending", "accepted", "rejected"]


# --- Patch language (section 5) -------------------------------------------------


class SetBasicsOp(ApiModel):
    op: Literal["setBasics"]
    basics: ResumeBasics


class UpsertSectionOp(ApiModel):
    op: Literal["upsertSection"]
    section: ResumeSection


class RemoveSectionOp(ApiModel):
    op: Literal["removeSection"]
    section_id: str


class UpsertEntryOp(ApiModel):
    op: Literal["upsertEntry"]
    section_id: str
    entry: ResumeEntry


class RemoveEntryOp(ApiModel):
    op: Literal["removeEntry"]
    section_id: str
    entry_id: str


PatchOp = Annotated[
    Union[SetBasicsOp, UpsertSectionOp, RemoveSectionOp, UpsertEntryOp, RemoveEntryOp],
    Field(discriminator="op"),
]


class PatchRequest(ApiModel):
    ops: list[PatchOp] = Field(min_length=1)
    reason: str = ""
    base_version_id: str | None = None


class PatchApplyRequest(PatchRequest):
    pending_action_id: str | None = None
    idempotency_key: str | None = Field(default=None, max_length=200)


class PatchError(ApiModel):
    op_index: int
    code: str
    message: str


class PatchValidationResponse(ApiModel):
    valid: bool
    errors: list[PatchError] = Field(default_factory=list)


class DiffItem(ApiModel):
    id: str
    target: str
    change_type: DiffChangeType
    before: str | None = None
    after: str | None = None
    reason: str = ""
    state: DiffState = "pending"


class PatchPreviewResponse(ApiModel):
    valid: bool
    resume_id: str
    base_version_id: str | None
    change_count: int
    affected_sections: list[str]
    diff: list[DiffItem]
    pending_action_id: str | None
    requires_confirmation: bool
    base_rebased: bool = False


class PatchApplyResponse(ApiModel):
    applied: bool
    user_turn_id: str
    resume_id: str
    change_count: int
    affected_sections: list[str]
    working_revision: int
    pending_action_id: str | None
    idempotent_replay: bool = False
    base_rebased: bool = False


# --- Resources (section 4) ------------------------------------------------------


class PendingActionResponse(ApiModel):
    id: str
    user_turn_id: str
    kind: Literal["content_patch"]
    title: str
    target_resource: str
    base_version_id: str | None
    impact_summary: str
    requires_text_confirm: bool = False
    state: PendingActionState
    stale_reason: str | None = None
    diff: list[DiffItem] = Field(default_factory=list)
    created_at: datetime
    decided_at: datetime | None = None


class TurnResult(ApiModel):
    state: Literal["finalized", "cancelled"]
    resume_id: str
    version_id: str | None
    change_count: int
    affected_sections: list[str]
    message: str
    idempotent_replay: bool = False
    base_rebased: bool = False


class UserTurnResponse(ApiModel):
    id: str
    resume_id: str
    client_id: str
    source: TurnSource
    execution_mode: ExecutionMode
    mode_source: ModeSource
    state: TurnState
    base_version_id: str | None
    session_id: str | None = None
    message: str
    created_at: datetime
    closed_at: datetime | None = None
    result: TurnResult | None = None
    pending_actions: list[PendingActionResponse] = Field(default_factory=list)


class WorkingDocumentResponse(ApiModel):
    resume_id: str
    document: ResumeDocument
    base_version_id: str | None
    user_turn_id: str | None
    working_revision: int
    dirty: bool


# --- Transport request bodies ---------------------------------------------------


class TurnCreateRequest(ApiModel):
    base_version_id: str | None = None
    execution_mode: ExecutionMode | None = None
    client_id: str | None = Field(default=None, max_length=64)
    source: TurnSource | None = None
    session_id: str | None = Field(default=None, max_length=36)
    message: str = Field(default="", max_length=1000)


class TurnFinalizeRequest(ApiModel):
    idempotency_key: str | None = Field(default=None, max_length=200)
    message: str = Field(default="", max_length=500)


class TurnCancelRequest(ApiModel):
    idempotency_key: str | None = Field(default=None, max_length=200)
    reason: str = Field(default="", max_length=500)


# --- sessions, messages and run checkpoints (issue 9d29a) ----------------------


MessageRole = Literal["system", "user", "assistant", "tool"]


class SessionCreateRequest(ApiModel):
    """POST /sessions accepts an optional empty object body."""


class SessionResponse(ApiModel):
    id: str
    created_at: datetime
    updated_at: datetime
    last_active_at: datetime


class SessionMessageCreateRequest(ApiModel):
    seq: int = Field(ge=0)
    role: MessageRole
    content: Any


class SessionMessageResponse(ApiModel):
    id: str
    session_id: str
    seq: int
    role: MessageRole
    content: Any
    created_at: datetime


class RunStateResponse(ApiModel):
    turn_id: str
    run_state: dict[str, Any]
    state_version: int


class RunStateUpdateRequest(ApiModel):
    state_version: int = Field(ge=0)
    run_state: dict[str, Any]


class RunStartRequest(ApiModel):
    """Body for POST /resumes/{resume_id}/runs."""

    prompt: str = Field(min_length=1, max_length=8000)
    execution_mode: ExecutionMode | None = None
    session_id: str | None = Field(default=None, max_length=36)


class RunStartResponse(ApiModel):
    run_id: str
    status: str


class RuntimeStatusResponse(ApiModel):
    """Runner readiness probe (GET /agent/runtime).

    available means the backend can spawn the runner when a run is requested:
    it is a PATH resolution check on the configured command, not a resident
    process check, and nothing is executed to produce it.
    """

    command: str
    available: bool


class PendingActionDecision(ApiModel):
    """Approve / reject accept an optional empty body."""
