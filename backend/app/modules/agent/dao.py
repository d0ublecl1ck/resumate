from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AgentOperation, AgentTurn, PendingAction


def get_turn(db: Session, turn_id: str) -> AgentTurn | None:
    return db.get(AgentTurn, turn_id)


def get_open_turn(db: Session, resume_id: str) -> AgentTurn | None:
    statement = (
        select(AgentTurn)
        .where(AgentTurn.resume_id == resume_id, AgentTurn.state == "open")
        .order_by(AgentTurn.created_at)
    )
    return db.scalars(statement).first()


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
