"""Thin client for the public Resumate REST API (contract section 6).

ResumateClient is the only place in the package that performs I/O. It speaks
the frozen JSON contract over httpx, translates error envelopes into
ApiClientError, and never touches the business database (C-09).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from urllib.parse import quote

import httpx

from .config import AgentCoreSettings
from .errors import ApiClientError, MalformedResponseError, TransportError
from .models import (
    AgentMessage,
    AgentSession,
    CancelTurnRequest,
    CapabilityResponse,
    CreateTurnRequest,
    FinalizeTurnRequest,
    PatchApplyRequest,
    PatchApplyResponse,
    PatchPreviewResponse,
    PatchRequest,
    PatchValidationResponse,
    PendingAction,
    ProfileActionPreview,
    ProfileFact,
    ProfileSummary,
    TurnState,
    UserTurn,
    WorkingDocument,
)
from .patches import build_apply_request, build_patch

_JSON = Mapping[str, Any]


def _wire_op(op: Any) -> Any:
    """Serialize one profile action op (model or plain mapping) for the wire."""
    wire = getattr(op, "to_wire", None)
    if callable(wire):
        return wire()
    return dict(op)


def _encode(value: str) -> str:
    """Percent-encode a path segment (ids are already URL-safe in practice)."""
    return quote(str(value), safe="")


class ResumateClient:
    """Synchronous client over the public Agent operation API.

    The client is a context manager:

    .. code-block:: python

        with ResumateClient(settings) as client:
            client.capability()
    """

    def __init__(
        self,
        settings: AgentCoreSettings | None = None,
        *,
        http_client: httpx.Client | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.settings = settings or AgentCoreSettings.from_env()
        self._owns_http = http_client is None
        if http_client is not None:
            self._http = http_client
        else:
            kwargs: dict[str, Any] = {
                "base_url": self.settings.base_url,
                "timeout": self.settings.timeout_seconds,
                "headers": self.settings.auth_headers(),
            }
            if transport is not None:
                kwargs["transport"] = transport
            self._http = httpx.Client(verify=self.settings.verify_ssl, **kwargs)

    # --- plumbing -----------------------------------------------------------

    def close(self) -> None:
        """Close the underlying httpx client when this instance owns it."""
        if self._owns_http:
            self._http.close()

    def __enter__(self) -> "ResumateClient":
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: _JSON | None = None,
        params: _JSON | None = None,
    ) -> Any:
        """Perform one request, raising typed errors on any failure."""
        try:
            response = self._http.request(
                method,
                path,
                json=json_body,
                params=params,
                headers=self.settings.auth_headers(),
            )
        except httpx.HTTPError as exc:
            raise TransportError(f"{method} {path} failed: {exc}", cause=exc) from exc
        if response.status_code >= 400:
            raise ApiClientError.from_response(response)
        if response.status_code == 204 or not response.content:
            return None
        try:
            return response.json()
        except ValueError as exc:
            raise MalformedResponseError(
                f"Expected a JSON body for {method} {path}",
                status_code=response.status_code,
                payload=response.text,
            ) from exc

    @staticmethod
    def _decode(model: type[Any], payload: Any) -> Any:
        if payload is None:
            raise MalformedResponseError("Expected a JSON object but received an empty body")
        return model.model_validate(payload)

    @staticmethod
    def _decode_list(model: type[Any], payload: Any) -> list[Any]:
        if not isinstance(payload, list):
            raise MalformedResponseError("Expected a JSON array from the API")
        return [model.model_validate(item) for item in payload]

    @staticmethod
    def _turn_path(turn_id: str) -> str:
        return f"/turns/{_encode(turn_id)}"

    # --- turns (contract section 4.1 / 6) -----------------------------------

    def create_turn(
        self,
        resume_id: str,
        *,
        base_version_id: str | None = None,
        execution_mode: str | None = None,
        client_id: str | None = None,
        source: str | None = None,
        session_id: str | None = None,
        message: str | None = None,
    ) -> UserTurn:
        """Open a turn, finalizing any previous open turn per C-04."""
        body = CreateTurnRequest(
            base_version_id=base_version_id,
            execution_mode=execution_mode,
            client_id=client_id,
            source=source,
            session_id=session_id,
            message=message,
        )
        payload = self._request(
            "POST",
            f"/resumes/{_encode(resume_id)}/turns",
            json_body=body.to_wire(),
        )
        return self._decode(UserTurn, payload)

    def get_turn(self, turn_id: str) -> UserTurn:
        """Read a turn and its pending-action projection."""
        return self._decode(UserTurn, self._request("GET", self._turn_path(turn_id)))

    def create_profile_turn(
        self,
        *,
        session_id: str,
        execution_mode: str | None = None,
        message: str | None = None,
    ) -> UserTurn:
        """Open a profile-scoped turn; the session carries the scope, no resume."""
        body: dict[str, Any] = {"scope": "profile", "sessionId": session_id}
        if execution_mode is not None:
            body["executionMode"] = execution_mode
        if message is not None:
            body["message"] = message
        return self._decode(UserTurn, self._request("POST", "/turns", json_body=body))

    def list_session_turns(self, session_id: str) -> list[UserTurn]:
        """List one session's turns, newest first."""
        payload = self._request("GET", f"/sessions/{_encode(session_id)}/turns")
        return self._decode_list(UserTurn, payload)

    def finalize_turn(
        self,
        turn_id: str,
        *,
        idempotency_key: str | None = None,
        message: str | None = None,
    ) -> UserTurn:
        """Atomically commit the working copy and close the turn (idempotent)."""
        body = FinalizeTurnRequest(idempotency_key=idempotency_key, message=message)
        payload = self._request(
            "POST",
            f"{self._turn_path(turn_id)}/finalize",
            json_body=body.to_wire(),
        )
        return self._decode(UserTurn, payload)

    def cancel_turn(
        self,
        turn_id: str,
        *,
        idempotency_key: str | None = None,
        reason: str | None = None,
    ) -> UserTurn:
        """Invalidate open pending actions and settle applied changes per C-04."""
        body = CancelTurnRequest(idempotency_key=idempotency_key, reason=reason)
        payload = self._request(
            "POST",
            f"{self._turn_path(turn_id)}/cancel",
            json_body=body.to_wire(),
        )
        return self._decode(UserTurn, payload)

    # --- patches (contract section 5 / 6) -----------------------------------

    @staticmethod
    def _patch_request(
        ops: Any,
        reason: str | None,
        base_version_id: str | None,
    ) -> PatchRequest:
        if isinstance(ops, PatchRequest):
            update: dict[str, Any] = {}
            if reason is not None:
                update["reason"] = reason
            if base_version_id is not None:
                update["base_version_id"] = base_version_id
            return ops.model_copy(update=update) if update else ops
        return build_patch(ops, reason=reason or "", base_version_id=base_version_id)

    @staticmethod
    def _apply_request(
        ops: Any,
        reason: str | None,
        base_version_id: str | None,
        pending_action_id: str | None,
        idempotency_key: str | None,
    ) -> PatchApplyRequest:
        if isinstance(ops, PatchApplyRequest):
            update: dict[str, Any] = {}
            if reason is not None:
                update["reason"] = reason
            if base_version_id is not None:
                update["base_version_id"] = base_version_id
            if pending_action_id is not None:
                update["pending_action_id"] = pending_action_id
            if idempotency_key is not None:
                update["idempotency_key"] = idempotency_key
            return ops.model_copy(update=update) if update else ops
        return build_apply_request(
            ops,
            reason=reason,
            base_version_id=base_version_id,
            pending_action_id=pending_action_id,
            idempotency_key=idempotency_key,
        )

    def validate_patch(
        self,
        turn_id: str,
        ops: Any,
        *,
        reason: str | None = None,
        base_version_id: str | None = None,
    ) -> PatchValidationResponse:
        """Validate a patch without side effects (all errors are returned)."""
        body = self._patch_request(ops, reason, base_version_id)
        payload = self._request(
            "POST",
            f"{self._turn_path(turn_id)}/patches:validate",
            json_body=body.to_wire(),
        )
        return self._decode(PatchValidationResponse, payload)

    def preview_patch(
        self,
        turn_id: str,
        ops: Any,
        *,
        reason: str | None = None,
        base_version_id: str | None = None,
    ) -> PatchPreviewResponse:
        """Compute the diff; in approval mode this opens a PendingAction."""
        body = self._patch_request(ops, reason, base_version_id)
        payload = self._request(
            "POST",
            f"{self._turn_path(turn_id)}/patches:preview",
            json_body=body.to_wire(),
        )
        return self._decode(PatchPreviewResponse, payload)

    def apply_patch(
        self,
        turn_id: str,
        ops: Any,
        *,
        reason: str | None = None,
        base_version_id: str | None = None,
        pending_action_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> PatchApplyResponse:
        """Write a patch to the working copy (approval requires the action id)."""
        body = self._apply_request(
            ops,
            reason,
            base_version_id,
            pending_action_id,
            idempotency_key,
        )
        payload = self._request(
            "POST",
            f"{self._turn_path(turn_id)}/patches:apply",
            json_body=body.to_wire(),
        )
        return self._decode(PatchApplyResponse, payload)

    # --- pending actions (contract section 4.3 / 6) -------------------------

    def list_pending_actions(self, turn_id: str) -> list[PendingAction]:
        """List the pending-action projection for a turn."""
        payload = self._request("GET", f"{self._turn_path(turn_id)}/pending-actions")
        return self._decode_list(PendingAction, payload)

    def approve_action(self, action_id: str) -> PendingAction:
        """Move a pending action from pending to approved."""
        payload = self._request(
            "POST",
            f"/pending-actions/{_encode(action_id)}/approve",
            json_body={},
        )
        return self._decode(PendingAction, payload)

    def reject_action(self, action_id: str) -> PendingAction:
        """Reject a pending action."""
        payload = self._request(
            "POST",
            f"/pending-actions/{_encode(action_id)}/reject",
            json_body={},
        )
        return self._decode(PendingAction, payload)

    # --- working copy and capability discovery ------------------------------

    def get_working_document(self, resume_id: str) -> WorkingDocument:
        """Read the working copy, falling back to the formal document."""
        payload = self._request("GET", f"/resumes/{_encode(resume_id)}/working-document")
        return self._decode(WorkingDocument, payload)

    def capability(self) -> CapabilityResponse:
        """Fetch public capability discovery (never user resources)."""
        payload = self._request("GET", "/.well-known/resume-agent")
        return self._decode(CapabilityResponse, payload)

    # --- profile scope (contract section 21) --------------------------------

    def get_profile(self) -> ProfileSummary:
        """Read the profile basics and its fact list (GET /profile)."""
        return self._decode(ProfileSummary, self._request("GET", "/profile"))

    def list_profile_facts(self) -> list[ProfileFact]:
        """Read the profile facts (GET /profile/facts)."""
        return self._decode_list(ProfileFact, self._request("GET", "/profile/facts"))

    def propose_profile_change(
        self,
        turn_id: str,
        *,
        ops: Any,
        reason: str | None = None,
    ) -> ProfileActionPreview:
        """Submit a profile change for human confirmation (POST .../profile-actions)."""
        body: dict[str, Any] = {"ops": [_wire_op(op) for op in ops]}
        if reason is not None:
            body["reason"] = reason
        return self._decode(
            ProfileActionPreview,
            self._request("POST", f"{self._turn_path(turn_id)}/profile-actions", json_body=body),
        )

    # --- sessions, messages and run checkpoints (contract section 19) --------

    def create_session(self) -> AgentSession:
        """Open a conversation that groups related turns."""
        payload = self._request("POST", "/sessions", json_body={})
        return self._decode(AgentSession, payload)

    def list_sessions(self) -> list[AgentSession]:
        """List the caller's sessions, most recently active first."""
        return self._decode_list(AgentSession, self._request("GET", "/sessions"))

    def list_session_messages(self, session_id: str, *, after_seq: int | None = None) -> list[AgentMessage]:
        """Read messages, optionally only those after a known sequence."""
        params = None if after_seq is None else {"afterSeq": after_seq}
        payload = self._request("GET", f"/sessions/{_encode(session_id)}/messages", params=params)
        return self._decode_list(AgentMessage, payload)

    def append_session_message(self, session_id: str, *, seq: int, role: str, content: Any) -> AgentMessage:
        """Append a message; the server is idempotent on (session_id, seq)."""
        payload = self._request(
            "POST",
            f"/sessions/{_encode(session_id)}/messages",
            json_body={"seq": seq, "role": role, "content": content},
        )
        return self._decode(AgentMessage, payload)

    def get_turn_state(self, turn_id: str) -> TurnState:
        """Read a turn's run checkpoint and its optimistic-lock version."""
        return self._decode(TurnState, self._request("GET", f"{self._turn_path(turn_id)}/state"))

    def update_turn_state(self, turn_id: str, *, state_version: int, run_state: Mapping[str, Any]) -> TurnState:
        """Write the run checkpoint, guarded by the version last read."""
        payload = self._request(
            "PUT",
            f"{self._turn_path(turn_id)}/state",
            json_body={"stateVersion": state_version, "runState": dict(run_state)},
        )
        return self._decode(TurnState, payload)

