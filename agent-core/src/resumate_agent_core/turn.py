"""TurnSession: a context-managed lifecycle for one resume-editing turn.

A turn is the unit of aggregation in the contract: patches accumulate in the
server-side working copy, and a finalize call turns them into at most one
ResumeVersion (C-03/C-04). TurnSession keeps that flow explicit for callers and
adds deterministic idempotency keys for safe retries (C-06).
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .client import ResumateClient
from .errors import ApiClientError, ErrorCode
from .models import PatchApplyResponse, PatchPreviewResponse, PendingAction, UserTurn
from .patches import build_patch


def make_idempotency_key(turn_id: str, operation: str, payload: Any = None) -> str:
    """Derive a stable idempotency key for a turn operation and payload.

    The same turn + operation + payload always yields the same key, so a retry
    after a timeout hits the server's replay path instead of double-applying.
    """
    material = json.dumps(
        {"turnId": turn_id, "operation": operation, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        default=str,
    )
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()
    return f"{operation}-{digest[:40]}"


class TurnSession:
    """Drives one UserTurn through begin / preview / approve / apply / close.

    Usage::

        with TurnSession(client, resume_id) as turn:
            turn.apply(patches.upsert_section(section))
            turn.finalize()

    Entering the context begins the turn. On an unhandled exception the session
    best-effort cancels the turn so a failed run does not leave a dangling open
    turn (C-04 settlement still happens server-side).
    """

    def __init__(
        self,
        client: ResumateClient,
        resume_id: str,
        *,
        base_version_id: str | None = None,
        execution_mode: str | None = None,
        client_id: str | None = None,
        source: str | None = None,
        message: str | None = None,
        turn_id: str | None = None,
        session_id: str | None = None,
    ) -> None:
        self.client = client
        self.resume_id = resume_id
        self.base_version_id = base_version_id
        self.execution_mode = execution_mode
        self.client_id = client_id
        self.source = source
        self.turn_message = message
        self.session_id = session_id
        self._turn: UserTurn | None = None
        self._pending_action_id: str | None = None
        if turn_id is not None:
            self._turn = client.get_turn(turn_id)
            self._pending_action_id = self._latest_pending_id(self._turn)

    # --- lifecycle ----------------------------------------------------------

    @property
    def turn(self) -> UserTurn:
        """The current turn; raises if begin() has not run yet."""
        if self._turn is None:
            raise RuntimeError("TurnSession.begin() must be called before use")
        return self._turn

    @property
    def turn_id(self) -> str:
        """The server-side turn id."""
        return self.turn.id

    @property
    def pending_action_id(self) -> str | None:
        """The most recent pending action id seen by this session, if any."""
        return self._pending_action_id

    @property
    def open(self) -> bool:
        """Whether the server still reports the turn as open."""
        return self._turn is not None and self._turn.state == "open"

    @staticmethod
    def _latest_pending_id(turn: UserTurn) -> str | None:
        for action in reversed(turn.pending_actions):
            if action.state == "pending":
                return action.id
        return None

    def begin(self) -> UserTurn:
        """Create (or adopt) the turn. Idempotent for this session."""
        if self._turn is not None:
            return self._turn
        self._turn = self.client.create_turn(
            self.resume_id,
            base_version_id=self.base_version_id,
            execution_mode=self.execution_mode,
            client_id=self.client_id,
            source=self.source,
            session_id=self.session_id,
            message=self.turn_message,
        )
        self._pending_action_id = self._latest_pending_id(self._turn)
        return self._turn

    def refresh(self) -> UserTurn:
        """Re-read the turn from the server (for reconnect scenarios)."""
        self._turn = self.client.get_turn(self.turn_id)
        return self._turn

    # --- patch flow ---------------------------------------------------------

    def preview(
        self,
        ops: Any,
        *,
        reason: str | None = None,
        base_version_id: str | None = None,
    ) -> PatchPreviewResponse:
        """Compute the diff and (approval mode) open a PendingAction."""
        result = self.client.preview_patch(
            self.turn_id,
            ops,
            reason=reason,
            base_version_id=base_version_id,
        )
        if result.pending_action_id:
            self._pending_action_id = result.pending_action_id
        return result

    def approve(self, pending_action_id: str | None = None) -> PendingAction:
        """Approve a pending action so an approval-mode apply may proceed."""
        action_id = pending_action_id or self._pending_action_id
        if not action_id:
            raise ValueError("no pending action to approve; call preview() first")
        action = self.client.approve_action(action_id)
        self._pending_action_id = action.id
        return action

    def reject(self, pending_action_id: str | None = None) -> PendingAction:
        """Reject a pending action."""
        action_id = pending_action_id or self._pending_action_id
        if not action_id:
            raise ValueError("no pending action to reject; call preview() first")
        return self.client.reject_action(action_id)

    def apply(
        self,
        ops: Any,
        *,
        pending_action_id: str | None = None,
        reason: str | None = None,
        base_version_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> PatchApplyResponse:
        """Write ops into the working copy.

        In approval mode pass the approved pendingActionId; the server refuses an
        unapproved apply even if the client omits it.
        """
        if pending_action_id is None:
            pending_action_id = self._pending_action_id
        payload = build_patch(ops, reason=reason or "", base_version_id=base_version_id).to_wire()
        if idempotency_key is None:
            idempotency_key = make_idempotency_key(
                self.turn_id,
                "apply",
                {"payload": payload, "pendingActionId": pending_action_id},
            )
        return self.client.apply_patch(
            self.turn_id,
            ops,
            reason=reason,
            base_version_id=base_version_id,
            pending_action_id=pending_action_id,
            idempotency_key=idempotency_key,
        )

    def execute_patch(
        self,
        ops: Any,
        *,
        reason: str | None = None,
        base_version_id: str | None = None,
    ) -> PatchApplyResponse:
        """Apply a patch end-to-end, following the turn's fixed execution mode.

        full_access applies directly. approval previews, requires the resulting
        PendingAction, approves it, then applies.
        """
        if self.turn.execution_mode == "full_access":
            return self.apply(ops, reason=reason, base_version_id=base_version_id)
        preview = self.preview(ops, reason=reason, base_version_id=base_version_id)
        if not preview.valid:
            raise ApiClientError(
                "Patch preview reported validation errors",
                code=ErrorCode.VALIDATION_FAILED,
                payload=preview.to_wire(),
            )
        if not preview.pending_action_id:
            raise ApiClientError(
                "Approval-mode preview did not return a pending action",
                code=ErrorCode.VALIDATION_FAILED,
                payload=preview.to_wire(),
            )
        self.approve(preview.pending_action_id)
        return self.apply(
            ops,
            pending_action_id=preview.pending_action_id,
            reason=reason,
            base_version_id=base_version_id,
        )

    # --- closing ------------------------------------------------------------

    def finalize(
        self,
        *,
        message: str | None = None,
        idempotency_key: str | None = None,
    ) -> UserTurn:
        """Aggregate and close the turn, producing at most one version (C-03)."""
        if idempotency_key is None:
            idempotency_key = make_idempotency_key(
                self.turn_id,
                "finalize",
                {"message": message},
            )
        self._turn = self.client.finalize_turn(
            self.turn_id,
            idempotency_key=idempotency_key,
            message=message,
        )
        return self._turn

    def cancel(
        self,
        *,
        reason: str | None = None,
        idempotency_key: str | None = None,
    ) -> UserTurn:
        """Cancel the turn, settling any applied changes per C-04."""
        if idempotency_key is None:
            idempotency_key = make_idempotency_key(
                self.turn_id,
                "cancel",
                {"reason": reason},
            )
        self._turn = self.client.cancel_turn(
            self.turn_id,
            idempotency_key=idempotency_key,
            reason=reason,
        )
        return self._turn

    # --- context manager ----------------------------------------------------

    def __enter__(self) -> "TurnSession":
        self.begin()
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> bool:
        if exc_type is not None and self.open:
            try:
                self.cancel(reason="agent run raised before finalize")
            except ApiClientError:
                # Best-effort cleanup; the original exception must win.
                pass
        return False
