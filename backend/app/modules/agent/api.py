from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import require_human_session, require_permission

from . import events, service
from .schemas import (
    PatchApplyRequest,
    PatchApplyResponse,
    PatchPreviewResponse,
    PatchRequest,
    PatchValidationResponse,
    PendingActionDecision,
    PendingActionResponse,
    RunStateResponse,
    RunStateUpdateRequest,
    SessionCreateRequest,
    SessionMessageCreateRequest,
    SessionMessageResponse,
    SessionResponse,
    TurnCancelRequest,
    TurnState,
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


@router.get("/resumes/{resume_id}/turns", response_model=list[UserTurnResponse])
def list_turns(
    resume_id: str,
    state: TurnState | None = Query(default=None),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> list[UserTurnResponse]:
    return service.list_turns(db, user, resume_id, state)


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


@router.get("/turns/{turn_id}/events")
def stream_turn_events(
    turn_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> StreamingResponse:
    """Subscribe to one turn as Server-Sent Events (contract section 18).

    The snapshot is resolved before the stream opens so an unknown or foreign
    turn still returns a normal 404 instead of a 200 that errors mid-stream.
    """
    settings = get_settings()
    snapshot = service.get_turn(db, user, turn_id)
    return StreamingResponse(
        events.turn_event_stream(
            db,
            user,
            turn_id,
            initial=snapshot,
            poll_interval=settings.sse_poll_interval_seconds,
            heartbeat_interval=settings.sse_heartbeat_interval_seconds,
        ),
        media_type=events.SSE_MEDIA_TYPE,
        headers=events.SSE_HEADERS,
    )


@router.post("/pending-actions/{action_id}/approve", response_model=PendingActionResponse)
def approve_action(
    action_id: str,
    payload: PendingActionDecision | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
    _human: CurrentUser = Depends(require_human_session),
) -> PendingActionResponse:
    return service.decide_action(db, user, action_id, approve=True)


@router.post("/pending-actions/{action_id}/reject", response_model=PendingActionResponse)
def reject_action(
    action_id: str,
    payload: PendingActionDecision | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
    _human: CurrentUser = Depends(require_human_session),
) -> PendingActionResponse:
    return service.decide_action(db, user, action_id, approve=False)


# --- sessions, messages and run checkpoints (issue 9d29a) -----------------------


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreateRequest | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> SessionResponse:
    return service.create_session(db, user)


@router.get("/sessions", response_model=list[SessionResponse])
def list_sessions(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> list[SessionResponse]:
    return service.list_sessions(db, user)


@router.get("/sessions/{session_id}/messages", response_model=list[SessionMessageResponse])
def list_session_messages(
    session_id: str,
    after_seq: int = Query(0, ge=0, alias="afterSeq"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> list[SessionMessageResponse]:
    return service.list_session_messages(db, user, session_id, after_seq)


@router.post(
    "/sessions/{session_id}/messages",
    response_model=SessionMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
def append_session_message(
    session_id: str,
    payload: SessionMessageCreateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> SessionMessageResponse:
    return service.append_session_message(db, user, session_id, payload)


@router.get("/turns/{turn_id}/state", response_model=RunStateResponse)
def get_turn_state(
    turn_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> RunStateResponse:
    return service.get_turn_state(db, user, turn_id)


@router.put("/turns/{turn_id}/state", response_model=RunStateResponse)
def update_turn_state(
    turn_id: str,
    payload: RunStateUpdateRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> RunStateResponse:
    return service.update_turn_state(db, user, turn_id, payload)
