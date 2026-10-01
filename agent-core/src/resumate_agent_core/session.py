"""Server-side session journal: durable conversation history (issue d2e4a).

The session layer and the checkpoint are deliberately different things. The
checkpoint (run_state) holds what a restart needs in order to continue; the
journal holds the conversation that history — and later summarisation — reads.
This module mirrors every model message that enters the runtime context into
agent_session_messages.

The seq of a message is "session base + its index in the context + 1". A run
that starts in a brand-new session has base 0; a run that appends to an existing
session starts after that session's last seq, so reusing a session never
overwrites older history. The base is deterministic input, so a replay after a
crash re-sends the same seq values and the server absorbs them on
(session_id, seq) instead of appending duplicates.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING

from .client import ResumateClient
from .errors import ApiClientError

if TYPE_CHECKING:  # pragma: no cover - typing-only import avoids a cycle
    from .runtime import Message


class SessionJournal:
    """Mirror one run's model context into a server-side session."""

    def __init__(self, client: ResumateClient, session_id: str | None = None) -> None:
        self._client = client
        self.session_id = session_id
        self._base = 0
        self._recorded = 0

    @property
    def recorded(self) -> int:
        """How many context messages are already known to the session."""
        return self._recorded

    @property
    def base(self) -> int:
        """The seq offset this run appends after."""
        return self._base

    def start(self, session_id: str | None = None, *, base: int | None = None, recorded: int = 0) -> str:
        """Adopt a session id, or create a new session when none is given.

        base is the seq offset; None means "derive it": a new session starts at
        zero, an existing one continues after its last seq. recorded is how many
        context messages a resumed run already mirrored.
        """
        if session_id is None:
            self.session_id = self._client.create_session().id
            self._base = 0 if base is None else max(0, base)
        else:
            self.session_id = session_id
            self._base = self._latest_seq(session_id) if base is None else max(0, base)
        self._recorded = max(0, recorded)
        return self.session_id

    def _latest_seq(self, session_id: str) -> int:
        """Continue after the session's current last seq, or start at zero."""
        rows = self._client.list_session_messages(session_id)
        return rows[-1].seq if rows else 0

    def record(self, messages: Sequence[Message]) -> int:
        """Mirror messages the session does not have yet; return the new count.

        Appends are best-effort, exactly like a checkpoint write: a failed append
        must not kill a live run, and the next call retries from the last
        confirmed seq (the server absorbs the replay).
        """
        if self.session_id is None:
            return self._recorded
        for index in range(self._recorded, len(messages)):
            message = messages[index]
            try:
                self._client.append_session_message(
                    self.session_id,
                    seq=self._base + index + 1,
                    role=message.role,
                    content=message.to_wire(),
                )
            except ApiClientError:
                return self._recorded
            self._recorded = index + 1
        return self._recorded
