from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AccessLog, PersonalAccessToken


def list_tokens(db: Session, owner_id: str) -> list[PersonalAccessToken]:
    statement = (
        select(PersonalAccessToken)
        .where(PersonalAccessToken.owner_id == owner_id)
        .order_by(PersonalAccessToken.created_at.desc())
    )
    return list(db.scalars(statement))


def get_token(db: Session, token_id: str) -> PersonalAccessToken | None:
    return db.get(PersonalAccessToken, token_id)


def add_token(db: Session, token: PersonalAccessToken) -> None:
    db.add(token)


def list_logs(db: Session, owner_id: str, *, limit: int = 100) -> list[AccessLog]:
    statement = (
        select(AccessLog)
        .where(AccessLog.owner_id == owner_id)
        .order_by(AccessLog.at.desc())
        .limit(limit)
    )
    return list(db.scalars(statement))


def add_log(db: Session, log: AccessLog) -> None:
    db.add(log)
