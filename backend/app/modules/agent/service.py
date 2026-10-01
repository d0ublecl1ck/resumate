"""Business rules for the agent operation layer (no FastAPI imports)."""

import copy
import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.modules.resume import service as resume_service
from app.modules.resume.models import Resume, ResumeVersion
from app.modules.settings import dao as settings_dao
from app.shared.errors import (
    BaseVersionStale,
    IdempotencyConflict,
    PendingActionNotApproved,
    PendingActionStale,
    RebaseConflict,
    ResourceNotFound,
    RunStateConflict,
    TurnAlreadyClosed,
    TurnNotOpen,
    ValidationFailed,
)

from . import dao, patch, rebase
from .models import AgentOperation, AgentSession, AgentSessionMessage, AgentTurn, PendingAction
from .schemas import (
    DiffItem,
    PatchApplyRequest,
    PatchApplyResponse,
    PatchPreviewResponse,
    PatchRequest,
    PatchValidationResponse,
    PendingActionResponse,
    RunStateResponse,
    RunStateUpdateRequest,
    SessionMessageCreateRequest,
    SessionMessageResponse,
    SessionResponse,
    TurnCancelRequest,
    TurnCreateRequest,
    TurnFinalizeRequest,
    TurnResult,
    UserTurnResponse,
    WorkingDocumentResponse,
)

DEFAULT_SOURCE = "agent"
DEFAULT_CLIENT_ID = "external"
DEFAULT_MODE = "approval"
MODE_VALUES = ("approval", "full_access")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _require_turn(db: Session, owner_id: str, turn_id: str) -> AgentTurn:
    turn = dao.get_turn(db, turn_id)
    if turn is None or turn.owner_id != owner_id:
        raise ResourceNotFound(f"轮次 {turn_id} 不存在")
    return turn


def _require_open(turn: AgentTurn) -> None:
    if turn.state != "open":
        raise TurnAlreadyClosed("轮次已关闭，不能再修改")


def _require_session(db: Session, owner_id: str, session_id: str) -> AgentSession:
    session = dao.get_session(db, session_id)
    if session is None or session.owner_id != owner_id:
        raise ResourceNotFound(f"会话 {session_id} 不存在")
    return session


def _touch_session(session: AgentSession) -> None:
    now = _now()
    session.updated_at = now
    session.last_active_at = now


def _resolve_mode(db: Session, user: CurrentUser, requested: str | None) -> tuple[str, str]:
    """Freeze the execution mode and its source for one turn (contract section 3).

    A delegated credential's executionMode is untrusted and ignored (C-01/C-02):
    both PAT and run tokens resolve only from the account agent config or the
    account default, so neither can promote an account to full_access through the
    request body.
    """
    if user.auth_kind == "session" and requested is not None:
        return requested, "session"
    settings = settings_dao.get_by_owner(db, user.id)
    if settings is not None:
        mode = (settings.agent_config or {}).get("nextRunMode")
        if mode in MODE_VALUES:
            return mode, "agent"
    return DEFAULT_MODE, "account"


def _candidate_document(turn: AgentTurn, resume: Resume) -> dict:
    """The document a patch is applied on: this turn's working copy, or committed."""
    if resume.working_turn_id == turn.id and resume.working_document is not None:
        return copy.deepcopy(resume.working_document)
    return copy.deepcopy(resume.document or {})


def _assert_base(turn: AgentTurn, resume: Resume, requested_base: str | None) -> None:
    if requested_base is not None and requested_base != turn.base_version_id:
        raise BaseVersionStale("Patch 基线版本与轮次基线不一致", latest_version_id=resume.current_version_id)
    if turn.base_version_id != resume.current_version_id:
        raise BaseVersionStale("简历已产生新版本，请重新开始轮次", latest_version_id=resume.current_version_id)


def _rebase_if_needed(db: Session, turn: AgentTurn, resume: Resume) -> bool:
    """Replay this turn's staged delta onto an advanced base (contract section 15).

    Returns True when the base moved and the turn was rebased. A conflict keeps
    the staged working copy untouched and raises REBASE_CONFLICT instead, which
    pauses the requested write; reads still expose the queued working document.
    """
    if turn.base_version_id == resume.current_version_id:
        return False
    if resume.working_turn_id != turn.id:
        # No staged changes: move the turn onto the new base and continue.
        turn.base_version_id = resume.current_version_id
        db.commit()
        return True
    old_base = resume_service.get_version_snapshot(db, turn.base_version_id) or {}
    staged = resume.working_document or {}
    new_base = resume.document or {}
    merged, conflict = rebase.merge_documents(old_base, staged, new_base)
    if conflict or merged is None:
        raise RebaseConflict(
            "暂存改动与最新版本冲突",
            latest_version_id=resume.current_version_id,
        )
    resume_service.stage_working_document(
        resume,
        merged,
        turn_id=turn.id,
        base_version_id=resume.current_version_id,
    )
    turn.base_version_id = resume.current_version_id
    if turn.execution_mode == "approval":
        for action in dao.list_actions_for_turn(db, turn.id):
            if action.state == "approved":
                action.state = "stale"
                action.stale_reason = "基线已推进，需重新预览与审批"
    db.commit()
    return True


def _rebase_or_abandon(db: Session, turn: AgentTurn, resume: Resume) -> tuple[bool, str | None]:
    """Rebase, or on conflict abandon the staged copy so the turn can close.

    Used by explicit cancel and the begin auto-close, where the turn must always
    be able to reach a closed state (contract 15.7). Returns
    (base_rebased, conflict_reason); a non-None reason means the staged working
    copy was discarded as an explicit abandonment.
    """
    try:
        return _rebase_if_needed(db, turn, resume), None
    except RebaseConflict as conflict:
        resume_service.clear_working_copy(resume)
        db.commit()
        return True, str(conflict)


# --- idempotency ----------------------------------------------------------------


def _canonical_hash(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _ops_payload(ops) -> list[dict]:
    return [op.model_dump(by_alias=True, exclude_none=True) for op in ops]


def _lookup_operation(db: Session, turn_id: str, kind: str, key: str | None) -> AgentOperation | None:
    if not key:
        return None
    return dao.get_operation(db, turn_id, kind, key)


def _assert_same_request(operation: AgentOperation, request_hash: str) -> None:
    if operation.request_hash != request_hash:
        raise IdempotencyConflict("相同幂等键对应了不同的请求内容")


def _store_operation(
    db: Session,
    turn: AgentTurn,
    kind: str,
    key: str | None,
    request_hash: str,
    response,
) -> None:
    if not key:
        return
    dao.add_operation(
        db,
        AgentOperation(
            id=_new_id("op"),
            owner_id=turn.owner_id,
            turn_id=turn.id,
            kind=kind,
            idempotency_key=key,
            request_hash=request_hash,
            response=response.model_dump(by_alias=True, mode="json"),
            created_at=_now(),
        ),
    )


def _replayed_turn(operation: AgentOperation) -> UserTurnResponse:
    response = UserTurnResponse.model_validate(operation.response)
    if response.result is not None:
        response.result.idempotent_replay = True
    return response


def _replayed_apply(operation: AgentOperation) -> PatchApplyResponse:
    response = PatchApplyResponse.model_validate(operation.response)
    response.idempotent_replay = True
    return response


# --- response mapping -----------------------------------------------------------


def _pending_action_response(action: PendingAction) -> PendingActionResponse:
    return PendingActionResponse(
        id=action.id,
        user_turn_id=action.turn_id,
        kind=action.kind,
        title=action.title,
        target_resource=action.resume_id,
        base_version_id=action.base_version_id,
        impact_summary=action.impact_summary,
        requires_text_confirm=action.requires_text_confirm,
        state=action.state,
        stale_reason=action.stale_reason,
        diff=[DiffItem.model_validate(item) for item in action.diff or []],
        created_at=action.created_at,
        decided_at=action.decided_at,
    )


def _turn_result(turn: AgentTurn, *, base_rebased: bool = False) -> TurnResult | None:
    if turn.result_state is None:
        return None
    return TurnResult(
        state=turn.result_state,
        resume_id=turn.resume_id,
        version_id=turn.result_version_id,
        change_count=turn.result_change_count or 0,
        affected_sections=list(turn.result_affected_sections or []),
        message=turn.result_message,
        base_rebased=base_rebased,
    )


def _turn_response(db: Session, turn: AgentTurn, *, base_rebased: bool = False) -> UserTurnResponse:
    return UserTurnResponse(
        id=turn.id,
        resume_id=turn.resume_id,
        client_id=turn.client_id,
        source=turn.source,
        execution_mode=turn.execution_mode,
        mode_source=turn.mode_source,
        state=turn.state,
        base_version_id=turn.base_version_id,
        session_id=turn.session_id,
        message=turn.message,
        created_at=turn.created_at,
        closed_at=turn.closed_at,
        result=_turn_result(turn, base_rebased=base_rebased),
        pending_actions=[_pending_action_response(action) for action in dao.list_actions_for_turn(db, turn.id)],
    )


def _apply_result(turn: AgentTurn, version: ResumeVersion | None, message: str, state: str) -> None:
    turn.state = state
    turn.closed_at = _now()
    turn.result_state = state
    turn.result_version_id = version.id if version else None
    turn.result_change_count = version.change_count if version else 0
    turn.result_affected_sections = list(version.affected_sections) if version else []
    turn.result_message = message


def _settle_working_changes(
    db: Session,
    turn: AgentTurn,
    resume: Resume,
    *,
    actor_id: str,
    message: str,
) -> ResumeVersion | None:
    """Commit this turn's staged changes when its base is still current (C-04)."""
    if resume.working_turn_id != turn.id:
        return None
    if turn.base_version_id != resume.current_version_id:
        clear_working_copy_quietly(resume)
        return None
    return resume_service.commit_working_copy(
        db,
        resume,
        actor_id=actor_id,
        message=message,
        source="agent",
        client_id=turn.client_id,
        user_turn_id=turn.id,
        execution_mode=turn.execution_mode,
    )


def clear_working_copy_quietly(resume: Resume) -> None:
    resume_service.clear_working_copy(resume)


# --- turn lifecycle -------------------------------------------------------------


def _close_open_turn(db: Session, turn: AgentTurn, user: CurrentUser) -> None:
    """C-04: settle and close an open turn before a new one starts.

    A rebase conflict must never block the next turn (contract 15.7): the old
    turn closes as cancelled and its conflicting staged copy is dropped so a
    new turn can start.
    """
    resume = resume_service.get_resume(db, user.id, turn.resume_id)
    _, conflict_reason = _rebase_or_abandon(db, turn, resume)
    if conflict_reason is not None:
        for action in dao.list_actions_for_turn(db, turn.id):
            if action.state == "pending":
                action.state = "stale"
                action.stale_reason = "基线冲突，旧轮次自动关闭"
        _apply_result(turn, None, f"基线冲突，旧轮次自动关闭（{conflict_reason}）", "cancelled")
        db.flush()
        return
    message = turn.message or "轮次自动结算"
    version = _settle_working_changes(db, turn, resume, actor_id=user.id, message=message)
    _apply_result(turn, version, message, "finalized")
    db.flush()


def begin_turn(db: Session, user: CurrentUser, resume_id: str, payload: TurnCreateRequest) -> UserTurnResponse:
    resume = resume_service.get_resume(db, user.id, resume_id)
    while True:
        open_turn = dao.get_open_turn(db, resume_id)
        if open_turn is None:
            break
        _close_open_turn(db, open_turn, user)
    if payload.base_version_id is not None and payload.base_version_id != resume.current_version_id:
        raise BaseVersionStale("简历已产生新版本，请基于最新版本重试", latest_version_id=resume.current_version_id)
    session = _require_session(db, user.id, payload.session_id) if payload.session_id else None
    mode, mode_source = _resolve_mode(db, user, payload.execution_mode)
    if user.auth_kind in ("pat", "run"):
        # Delegated credentials fix the client identity and the turn is always
        # agent-sourced; a request-body clientId/source is untrusted and ignored
        # (contract 13.4). A run credential reports its own run id as client id.
        client_id = (user.client_id or user.pat_id or DEFAULT_CLIENT_ID)[:64]
        source = DEFAULT_SOURCE
    else:
        client_id = payload.client_id or DEFAULT_CLIENT_ID
        source = payload.source if payload.source in ("agent", "client") else DEFAULT_SOURCE
    turn = AgentTurn(
        id=_new_id("turn"),
        owner_id=user.id,
        resume_id=resume.id,
        client_id=client_id,
        source=source,
        execution_mode=mode,
        mode_source=mode_source,
        state="open",
        base_version_id=resume.current_version_id,
        session_id=session.id if session is not None else None,
        message=payload.message,
        result_message="",
        created_at=_now(),
    )
    if session is not None:
        _touch_session(session)
    dao.add_turn(db, turn)
    db.commit()
    db.refresh(turn)
    return _turn_response(db, turn)


def get_turn(db: Session, user: CurrentUser, turn_id: str) -> UserTurnResponse:
    return _turn_response(db, _require_turn(db, user.id, turn_id))


def list_turns(
    db: Session, user: CurrentUser, resume_id: str, state: str | None = None
) -> list[UserTurnResponse]:
    """List this resume's turns (newest first), including preview-only open ones.

    Turn discovery must not depend on the working copy: in approval mode a
    preview creates a PendingAction without staging anything, so
    resume.working_turn_id stays empty until apply. The resume ownership check
    keeps the listing owner-isolated.
    """
    resume_service.get_resume(db, user.id, resume_id)
    return [_turn_response(db, turn) for turn in dao.list_turns(db, resume_id, user.id, state)]


def finalize_turn(db: Session, user: CurrentUser, turn_id: str, payload: TurnFinalizeRequest) -> UserTurnResponse:
    turn = _require_turn(db, user.id, turn_id)
    request_hash = _canonical_hash({"message": payload.message or ""})
    operation = _lookup_operation(db, turn.id, "finalize", payload.idempotency_key)
    if operation is not None:
        _assert_same_request(operation, request_hash)
        return _replayed_turn(operation)
    _require_open(turn)
    resume = resume_service.get_resume(db, user.id, turn.resume_id)
    base_rebased = _rebase_if_needed(db, turn, resume)
    message = payload.message or turn.message or "Agent 轮次提交"
    version = _settle_working_changes(db, turn, resume, actor_id=user.id, message=message)
    _apply_result(turn, version, message, "finalized")
    response = _turn_response(db, turn, base_rebased=base_rebased)
    _store_operation(db, turn, "finalize", payload.idempotency_key, request_hash, response)
    db.commit()
    return response


def cancel_turn(db: Session, user: CurrentUser, turn_id: str, payload: TurnCancelRequest) -> UserTurnResponse:
    turn = _require_turn(db, user.id, turn_id)
    request_hash = _canonical_hash({"reason": payload.reason or ""})
    operation = _lookup_operation(db, turn.id, "cancel", payload.idempotency_key)
    if operation is not None:
        _assert_same_request(operation, request_hash)
        return _replayed_turn(operation)
    _require_open(turn)
    resume = resume_service.get_resume(db, user.id, turn.resume_id)
    base_rebased, conflict_reason = _rebase_or_abandon(db, turn, resume)
    for action in dao.list_actions_for_turn(db, turn.id):
        if action.state == "pending":
            action.state = "stale"
            action.stale_reason = "轮次已取消"
    if conflict_reason is not None:
        # Explicit abandonment (contract 15.7): the conflicting staged copy is
        # dropped on purpose so the turn can close, and the reason is recorded.
        message = f"{payload.reason or 'Agent 轮次取消'}（{conflict_reason}）；暂存改动已按显式取消丢弃"
        version = None
    else:
        message = payload.reason or "Agent 轮次取消"
        version = _settle_working_changes(db, turn, resume, actor_id=user.id, message=message)
    _apply_result(turn, version, message, "cancelled")
    response = _turn_response(db, turn, base_rebased=base_rebased)
    _store_operation(db, turn, "cancel", payload.idempotency_key, request_hash, response)
    db.commit()
    return response


# --- patch operations -----------------------------------------------------------


def validate_patch(db: Session, user: CurrentUser, turn_id: str, payload: PatchRequest) -> PatchValidationResponse:
    turn = _require_turn(db, user.id, turn_id)
    _require_open(turn)
    resume = resume_service.get_resume(db, user.id, turn.resume_id)
    errors = patch.validate(_candidate_document(turn, resume), payload.ops)
    return PatchValidationResponse(valid=not errors, errors=errors)


def preview_patch(db: Session, user: CurrentUser, turn_id: str, payload: PatchRequest) -> PatchPreviewResponse:
    turn = _require_turn(db, user.id, turn_id)
    _require_open(turn)
    resume = resume_service.get_resume(db, user.id, turn.resume_id)
    base_rebased = _rebase_if_needed(db, turn, resume)
    _assert_base(turn, resume, payload.base_version_id)
    document = _candidate_document(turn, resume)
    errors = patch.validate(document, payload.ops)
    if errors:
        return PatchPreviewResponse(
            valid=False,
            resume_id=resume.id,
            base_version_id=turn.base_version_id,
            change_count=0,
            affected_sections=[],
            diff=[],
            pending_action_id=None,
            requires_confirmation=False,
            base_rebased=base_rebased,
        )
    after = patch.apply(document, payload.ops)
    diff = patch.build_diff(document, after, payload.reason)
    change_count, affected_sections = resume_service.summarize_changes(document, after)
    pending_action_id: str | None = None
    requires_confirmation = turn.execution_mode == "approval"
    if requires_confirmation:
        for existing in dao.list_actions_for_turn(db, turn.id):
            if existing.state == "pending":
                existing.state = "stale"
                existing.stale_reason = "已被新的预览取代"
        action = PendingAction(
            id=_new_id("pa"),
            owner_id=user.id,
            turn_id=turn.id,
            resume_id=resume.id,
            kind="content_patch",
            title=f"内容修改（{change_count} 处）",
            base_version_id=turn.base_version_id,
            impact_summary=f"影响 {len(affected_sections)} 个章节，共 {change_count} 处变更",
            requires_text_confirm=False,
            state="pending",
            ops=_ops_payload(payload.ops),
            reason=payload.reason,
            diff=[item.model_dump(by_alias=True, mode="json") for item in diff],
            change_count=change_count,
            affected_sections=list(affected_sections),
            created_at=_now(),
        )
        dao.add_action(db, action)
        db.commit()
        db.refresh(action)
        pending_action_id = action.id
    return PatchPreviewResponse(
        valid=True,
        resume_id=resume.id,
        base_version_id=turn.base_version_id,
        change_count=change_count,
        affected_sections=list(affected_sections),
        diff=diff,
        pending_action_id=pending_action_id,
        requires_confirmation=requires_confirmation,
        base_rebased=base_rebased,
    )


def _authorize_pending(action: PendingAction, request_payload: dict) -> None:
    if action.state == "stale":
        raise PendingActionStale(action.stale_reason or "待办已失效，请重新预览")
    if action.state != "approved":
        raise PendingActionNotApproved("待办尚未通过审批")
    stored = {"ops": action.ops or [], "reason": action.reason}
    requested = {"ops": request_payload["ops"], "reason": request_payload["reason"]}
    if _canonical_hash(stored) != _canonical_hash(requested):
        action.state = "stale"
        action.stale_reason = "应用内容与批准的预览不一致"
        raise PendingActionStale("应用内容与批准的预览不一致")


def apply_patch(db: Session, user: CurrentUser, turn_id: str, payload: PatchApplyRequest) -> PatchApplyResponse:
    turn = _require_turn(db, user.id, turn_id)
    request_hash = _canonical_hash(
        {
            "ops": _ops_payload(payload.ops),
            "reason": payload.reason,
            "baseVersionId": payload.base_version_id,
            "pendingActionId": payload.pending_action_id,
        }
    )
    operation = _lookup_operation(db, turn.id, "apply", payload.idempotency_key)
    if operation is not None:
        _assert_same_request(operation, request_hash)
        return _replayed_apply(operation)
    _require_open(turn)
    resume = resume_service.get_resume(db, user.id, turn.resume_id)
    base_rebased = _rebase_if_needed(db, turn, resume)
    _assert_base(turn, resume, payload.base_version_id)

    action: PendingAction | None = None
    if turn.execution_mode == "approval":
        if payload.pending_action_id is None:
            raise PendingActionNotApproved("审批模式下需要先预览并通过审批的待办")
        action = dao.get_action(db, payload.pending_action_id)
        if action is None or action.owner_id != user.id or action.turn_id != turn.id:
            raise ResourceNotFound(f"待办 {payload.pending_action_id} 不存在")
        _authorize_pending(action, {"ops": _ops_payload(payload.ops), "reason": payload.reason})

    document = _candidate_document(turn, resume)
    errors = patch.validate(document, payload.ops)
    if errors:
        raise ValidationFailed("；".join(error.message for error in errors))
    after = patch.apply(document, payload.ops)
    change_count, affected_sections = resume_service.summarize_changes(document, after)
    resume_service.stage_working_document(resume, after, turn_id=turn.id, base_version_id=turn.base_version_id)
    if action is not None:
        action.state = "consumed"
        action.decided_at = action.decided_at or _now()
    response = PatchApplyResponse(
        applied=True,
        user_turn_id=turn.id,
        resume_id=resume.id,
        change_count=change_count,
        affected_sections=list(affected_sections),
        working_revision=resume.working_revision,
        pending_action_id=action.id if action else None,
        base_rebased=base_rebased,
    )
    _store_operation(db, turn, "apply", payload.idempotency_key, request_hash, response)
    db.commit()
    db.refresh(resume)
    return response


# --- pending actions and working copy -------------------------------------------


def list_pending_actions(db: Session, user: CurrentUser, turn_id: str) -> list[PendingActionResponse]:
    turn = _require_turn(db, user.id, turn_id)
    return [_pending_action_response(action) for action in dao.list_actions_for_turn(db, turn.id)]


def decide_action(db: Session, user: CurrentUser, action_id: str, *, approve: bool) -> PendingActionResponse:
    action = dao.get_action(db, action_id)
    if action is None or action.owner_id != user.id:
        raise ResourceNotFound(f"待办 {action_id} 不存在")
    turn = dao.get_turn(db, action.turn_id)
    if turn is None or turn.state != "open":
        raise TurnNotOpen("所属轮次已关闭，无法处理待办")
    if action.state != "pending":
        raise ValidationFailed("待办已处理，不能重复操作")
    action.state = "approved" if approve else "rejected"
    action.decided_at = _now()
    db.commit()
    db.refresh(action)
    return _pending_action_response(action)


def get_working_document(db: Session, user: CurrentUser, resume_id: str) -> WorkingDocumentResponse:
    resume = resume_service.get_resume(db, user.id, resume_id)
    return WorkingDocumentResponse(
        resume_id=resume.id,
        document=resume_service.read_working_document(resume),
        base_version_id=resume.working_base_version_id,
        user_turn_id=resume.working_turn_id,
        working_revision=resume.working_revision or 0,
        dirty=resume_service.working_copy_is_dirty(resume),
    )


# --- sessions, messages and run checkpoints (issue 9d29a) -----------------------


def _session_response(session: AgentSession) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        created_at=session.created_at,
        updated_at=session.updated_at,
        last_active_at=session.last_active_at,
    )


def _message_response(message: AgentSessionMessage) -> SessionMessageResponse:
    return SessionMessageResponse(
        id=message.id,
        session_id=message.session_id,
        seq=message.seq,
        role=message.role,
        content=message.content,
        created_at=message.created_at,
    )


def _run_state_response(turn: AgentTurn) -> RunStateResponse:
    return RunStateResponse(
        turn_id=turn.id,
        run_state=turn.run_state or {},
        state_version=turn.state_version or 0,
    )


def create_session(db: Session, user: CurrentUser) -> SessionResponse:
    now = _now()
    session = AgentSession(
        id=_new_id("sess"),
        owner_id=user.id,
        created_at=now,
        updated_at=now,
        last_active_at=now,
    )
    dao.add_session(db, session)
    db.commit()
    db.refresh(session)
    return _session_response(session)


def list_sessions(db: Session, user: CurrentUser) -> list[SessionResponse]:
    return [_session_response(session) for session in dao.list_sessions(db, user.id)]


def list_session_messages(
    db: Session, user: CurrentUser, session_id: str, after_seq: int = 0
) -> list[SessionMessageResponse]:
    session = _require_session(db, user.id, session_id)
    return [_message_response(message) for message in dao.list_messages(db, session.id, after_seq)]


def append_session_message(
    db: Session, user: CurrentUser, session_id: str, payload: SessionMessageCreateRequest
) -> SessionMessageResponse:
    """Append a message, idempotent on (session_id, seq).

    The seq is the identity of a message inside a session, so a repeat of the
    same seq returns the stored row instead of creating a duplicate; a client
    that re-sends its checkpoint cannot corrupt the ordered history.
    """
    session = _require_session(db, user.id, session_id)
    existing = dao.get_message_by_seq(db, session.id, payload.seq)
    if existing is not None:
        return _message_response(existing)
    message = AgentSessionMessage(
        id=_new_id("msg"),
        session_id=session.id,
        seq=payload.seq,
        role=payload.role,
        content=payload.content,
        created_at=_now(),
    )
    dao.add_message(db, message)
    _touch_session(session)
    db.commit()
    db.refresh(message)
    return _message_response(message)


def get_turn_state(db: Session, user: CurrentUser, turn_id: str) -> RunStateResponse:
    return _run_state_response(_require_turn(db, user.id, turn_id))


def update_turn_state(
    db: Session, user: CurrentUser, turn_id: str, payload: RunStateUpdateRequest
) -> RunStateResponse:
    """Write the run checkpoint with an optimistic-lock version check.

    The client passes the state_version it last read; a mismatch means another
    writer advanced the checkpoint, so the write is rejected instead of
    silently overwriting newer state.
    """
    turn = _require_turn(db, user.id, turn_id)
    current = turn.state_version or 0
    if payload.state_version != current:
        raise RunStateConflict(
            f"run 状态版本不匹配：当前 {current}，收到 {payload.state_version}"
        )
    turn.run_state = payload.run_state
    turn.state_version = current + 1
    db.commit()
    db.refresh(turn)
    return _run_state_response(turn)
