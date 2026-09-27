from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import require_permission

from . import service
from .schemas import (
    PatchApplyRequest,
    PatchApplyResponse,
    PatchPreviewResponse,
    PatchRequest,
    PatchValidationResponse,
    PendingActionDecision,
    PendingActionResponse,
    TurnCancelRequest,
    TurnCreateRequest,
    TurnFinalizeRequest,
    UserTurnResponse,
    WorkingDocumentResponse,
)

router = APIRouter(tags=["agent"])


@router.post("/resumes/{resume_id}/turns", response_model=UserTurnResponse, status_code=status.HTTP_201_CREATED)
def create_turn(
    resume_id: str,
    payload: TurnCreateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> UserTurnResponse:
    return service.begin_turn(db, user, resume_id, payload)


@router.get("/turns/{turn_id}", response_model=UserTurnResponse)
def get_turn(
    turn_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> UserTurnResponse:
    return service.get_turn(db, user, turn_id)


@router.post("/turns/{turn_id}/finalize", response_model=UserTurnResponse)
def finalize_turn(
    turn_id: str,
    payload: TurnFinalizeRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> UserTurnResponse:
    return service.finalize_turn(db, user, turn_id, payload)


@router.post("/turns/{turn_id}/cancel", response_model=UserTurnResponse)
def cancel_turn(
    turn_id: str,
    payload: TurnCancelRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> UserTurnResponse:
    return service.cancel_turn(db, user, turn_id, payload)


@router.post("/turns/{turn_id}/patches:validate", response_model=PatchValidationResponse)
def validate_patch(
    turn_id: str,
    payload: PatchRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> PatchValidationResponse:
    return service.validate_patch(db, user, turn_id, payload)


@router.post("/turns/{turn_id}/patches:preview", response_model=PatchPreviewResponse)
def preview_patch(
    turn_id: str,
    payload: PatchRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> PatchPreviewResponse:
    return service.preview_patch(db, user, turn_id, payload)


@router.post("/turns/{turn_id}/patches:apply", response_model=PatchApplyResponse)
def apply_patch(
    turn_id: str,
    payload: PatchApplyRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> PatchApplyResponse:
    return service.apply_patch(db, user, turn_id, payload)


@router.get("/turns/{turn_id}/pending-actions", response_model=list[PendingActionResponse])
def list_pending_actions(
    turn_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> list[PendingActionResponse]:
    return service.list_pending_actions(db, user, turn_id)


@router.get("/resumes/{resume_id}/working-document", response_model=WorkingDocumentResponse)
def get_working_document(
    resume_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> WorkingDocumentResponse:
    return service.get_working_document(db, user, resume_id)


@router.post("/pending-actions/{action_id}/approve", response_model=PendingActionResponse)
def approve_action(
    action_id: str,
    payload: PendingActionDecision | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> PendingActionResponse:
    return service.decide_action(db, user, action_id, approve=True)


@router.post("/pending-actions/{action_id}/reject", response_model=PendingActionResponse)
def reject_action(
    action_id: str,
    payload: PendingActionDecision | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> PendingActionResponse:
    return service.decide_action(db, user, action_id, approve=False)
