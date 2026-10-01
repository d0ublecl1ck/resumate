"""Per-turn run checkpoint over the public API (issue 9d29a).

agent-core never touches the database (C-09). The checkpoint lives server-side
on the turn (GET|PUT /turns/{turn_id}/state); this store only translates between
the runtime's messages/budget and that wire state, plus the optimistic-lock
retry that keeps a single-writer run self-consistent.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from .client import ResumateClient
from .errors import ApiClientError, ErrorCode
from .models import TurnState
from .runtime import Message, RunBudget

CHECKPOINT_VERSION = 1

PHASE_RUNNING = "running"
PHASE_AWAITING_APPROVAL = "awaiting_approval"
PHASE_FINALIZED = "finalized"
PHASE_CANCELLED = "cancelled"
PHASE_FAILED = "failed"


def build_run_state(
    *,
    messages: Sequence[Message],
    budget: RunBudget,
    phase: str,
    pending_action_id: str | None = None,
    extra: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Project the runtime's in-memory state into the checkpoint payload."""
    payload: dict[str, Any] = {
        "version": CHECKPOINT_VERSION,
        "phase": phase,
        "pendingActionId": pending_action_id,
        "budget": budget.snapshot(),
        "messages": [message.to_wire() for message in messages],
    }
    if extra:
        payload.update(dict(extra))
    return payload


def messages_from_run_state(run_state: Mapping[str, Any] | None) -> list[Message]:
    """Rebuild the chat context stored in a checkpoint payload."""
    if not run_state:
        return []
    raw = run_state.get("messages") or []
    return [Message.from_wire(item) for item in raw if isinstance(item, Mapping)]


class CheckpointStore:
    """Read and write one turn's checkpoint through the public API."""

    def __init__(self, client: ResumateClient) -> None:
        self.client = client

    def load(self, turn_id: str) -> TurnState:
        """Read the stored checkpoint (empty run state when never written)."""
        return self.client.get_turn_state(turn_id)

    def save(
        self,
        turn_id: str,
        *,
        messages: Sequence[Message],
        budget: RunBudget,
        phase: str,
        pending_action_id: str | None = None,
        extra: Mapping[str, Any] | None = None,
    ) -> TurnState:
        """Write the checkpoint, guarded by the version last read."""
        run_state = build_run_state(
            messages=messages,
            budget=budget,
            phase=phase,
            pending_action_id=pending_action_id,
            extra=extra,
        )
        state = self.client.get_turn_state(turn_id)
        try:
            return self.client.update_turn_state(
                turn_id, state_version=state.state_version, run_state=run_state
            )
        except ApiClientError as exc:
            if exc.code != ErrorCode.RUN_STATE_CONFLICT:
                raise
            # Another writer advanced the version between our read and write;
            # re-read once so the checkpoint still lands instead of being lost.
            state = self.client.get_turn_state(turn_id)
            return self.client.update_turn_state(
                turn_id, state_version=state.state_version, run_state=run_state
            )
