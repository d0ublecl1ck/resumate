from datetime import datetime, timezone
from uuid import uuid4

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


def get_token_by_hash(db: Session, token_hash: str) -> PersonalAccessToken | None:
    return db.scalar(select(PersonalAccessToken).where(PersonalAccessToken.token_hash == token_hash))


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


def record_access_log(
    db: Session,
    *,
    owner_id: str,
    client_id: str,
    scope: str,
    resource: str,
    purpose: str,
    result: str,
    error_code: str | None = None,
) -> AccessLog:
    """Append one audit row; the caller owns the surrounding transaction."""
    log = AccessLog(
        id=f"log_{uuid4().hex[:12]}",
        owner_id=owner_id,
        at=datetime.now(timezone.utc),
        client_id=client_id,
        scope=scope,
        resource=resource,
        purpose=purpose,
        result=result,
        error_code=error_code,
    )
    db.add(log)
    return log
