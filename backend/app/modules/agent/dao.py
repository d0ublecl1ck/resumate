from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AgentOperation, AgentSession, AgentSessionMessage, AgentTurn, PendingAction


def get_turn(db: Session, turn_id: str) -> AgentTurn | None:
    return db.get(AgentTurn, turn_id)


def get_open_turn(db: Session, resume_id: str) -> AgentTurn | None:
    statement = (
        select(AgentTurn)
        .where(AgentTurn.resume_id == resume_id, AgentTurn.state == "open")
        .order_by(AgentTurn.created_at)
    )
    return db.scalars(statement).first()


def list_turns(
    db: Session,
    resume_id: str,
    owner_id: str,
    state: str | None = None,
    limit: int = 100,
) -> list[AgentTurn]:
    """List one resume's turns newest-first, optionally filtered by state."""
    statement = select(AgentTurn).where(
        AgentTurn.resume_id == resume_id,
        AgentTurn.owner_id == owner_id,
    )
    if state is not None:
        statement = statement.where(AgentTurn.state == state)
    statement = statement.order_by(AgentTurn.created_at.desc(), AgentTurn.id.desc()).limit(limit)
    return list(db.scalars(statement))


def add_turn(db: Session, turn: AgentTurn) -> None:
    db.add(turn)


def list_actions_for_turn(db: Session, turn_id: str) -> list[PendingAction]:
    statement = (
        select(PendingAction)
        .where(PendingAction.turn_id == turn_id)
        .order_by(PendingAction.created_at, PendingAction.id)
    )
    return list(db.scalars(statement))


def get_action(db: Session, action_id: str) -> PendingAction | None:
    return db.get(PendingAction, action_id)


def add_action(db: Session, action: PendingAction) -> None:
    db.add(action)


def get_operation(db: Session, turn_id: str, kind: str, idempotency_key: str) -> AgentOperation | None:
    statement = select(AgentOperation).where(
        AgentOperation.turn_id == turn_id,
        AgentOperation.kind == kind,
        AgentOperation.idempotency_key == idempotency_key,
    )
    return db.scalars(statement).first()


def add_operation(db: Session, operation: AgentOperation) -> None:
    db.add(operation)


# --- sessions and messages (issue 9d29a) --------------------------------------


def add_session(db: Session, session: AgentSession) -> None:
    db.add(session)


def get_session(db: Session, session_id: str) -> AgentSession | None:
    return db.get(AgentSession, session_id)


def list_sessions(db: Session, owner_id: str, limit: int = 50) -> list[AgentSession]:
    statement = (
        select(AgentSession)
        .where(AgentSession.owner_id == owner_id)
        .order_by(AgentSession.last_active_at.desc(), AgentSession.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(statement))


def add_message(db: Session, message: AgentSessionMessage) -> None:
    db.add(message)


def get_message_by_seq(db: Session, session_id: str, seq: int) -> AgentSessionMessage | None:
    statement = select(AgentSessionMessage).where(
        AgentSessionMessage.session_id == session_id,
        AgentSessionMessage.seq == seq,
    )
    return db.scalars(statement).first()


def list_messages(db: Session, session_id: str, after_seq: int = 0) -> list[AgentSessionMessage]:
    statement = (
        select(AgentSessionMessage)
        .where(AgentSessionMessage.session_id == session_id, AgentSessionMessage.seq > after_seq)
        .order_by(AgentSessionMessage.seq)
    )
    return list(db.scalars(statement))
