"""Server-Sent Events for one Agent turn (contract section 18).

The synchronous architecture has no run loop yet, so the only truthful source
of events is the persisted turn + pending-action state. The generator polls the
database, compares the projection and pushes a frame only on a real change;
otherwise it keeps the connection alive with an SSE comment heartbeat. It does
not emit synthetic progress/token/step events.
"""

from __future__ import annotations

import json
import time
from collections.abc import Generator

from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.shared.errors import ApiException

from . import service
from .schemas import UserTurnResponse

SSE_MEDIA_TYPE = "text/event-stream"
# X-Accel-Buffering disables nginx proxy buffering; Cache-Control stops any
# intermediary from caching the stream; Connection keeps HTTP/1.1 links open.
SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}
SSE_RETRY_MS = 3000
HEARTBEAT_COMMENT = ": heartbeat"


def format_event(event: str, data: str, event_id: int | None = None) -> str:
    """Render one SSE frame; data lines are split so no payload can break framing."""
    lines: list[str] = []
    if event_id is not None:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event}")
    for line in data.splitlines() or [""]:
        lines.append(f"data: {line}")
    return "\n".join(lines) + "\n\n"


def format_retry(milliseconds: int) -> str:
    return f"retry: {milliseconds}\n\n"


def format_heartbeat() -> str:
    return f"{HEARTBEAT_COMMENT}\n\n"


def _projection(turn: UserTurnResponse) -> str:
    return json.dumps(turn.model_dump(by_alias=True, mode="json"), ensure_ascii=False, separators=(",", ":"))


def turn_event_stream(
    db: Session,
    user: CurrentUser,
    turn_id: str,
    *,
    initial: UserTurnResponse | None = None,
    poll_interval: float = 1.0,
    heartbeat_interval: float = 15.0,
) -> Generator[str, None, None]:
    """Yield SSE frames for one turn until the client disconnects.

    The initial projection is the one the endpoint already authorized; the loop
    re-reads through the same request session, expiring the identity map between
    polls so committed changes from other requests are picked up on the next
    SELECT.
    """
    current = (
        _projection(initial)
        if initial is not None
        else _projection(service.get_turn(db, user, turn_id))
    )
    yield format_retry(SSE_RETRY_MS)
    yield format_event("snapshot", current, 1)
    sequence = 1
    idle = 0.0
    while True:
        time.sleep(poll_interval)
        idle += poll_interval
        # Expire the identity map; under READ COMMITTED a fresh SELECT already
        # sees other requests' committed changes, and this keeps the generator
        # usable with an externally managed (test) session.
        db.expire_all()
        try:
            following = _projection(service.get_turn(db, user, turn_id))
        except ApiException:
            # The turn is gone (deleted or ownership changed): stop instead
            # of keeping an erroring poll alive.
            return
        if following != current:
            current = following
            sequence += 1
            idle = 0.0
            yield format_event("turn.updated", current, sequence)
        elif idle >= heartbeat_interval:
            idle = 0.0
            yield format_heartbeat()
