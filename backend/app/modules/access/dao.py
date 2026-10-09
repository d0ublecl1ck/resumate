from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, or_, select
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


def list_logs(
    db: Session,
    owner_id: str,
    *,
    purpose: str | None = None,
    result: str | None = None,
    query: str | None = None,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[list[AccessLog], int]:
    """Return one page of audit rows (newest first) plus the filtered total.

    from_at/to_at bound AccessLog.at inclusively; either may be None for a
    single-sided filter. Callers pass timezone-aware values.
    """
    filters = [AccessLog.owner_id == owner_id]
    if purpose:
        filters.append(AccessLog.purpose == purpose)
    if result:
        filters.append(AccessLog.result == result)
    if from_at is not None:
        filters.append(AccessLog.at >= from_at)
    if to_at is not None:
        filters.append(AccessLog.at <= to_at)
    if query:
        pattern = f"%{query}%"
        filters.append(
            or_(
                AccessLog.client_id.ilike(pattern),
                AccessLog.scope.ilike(pattern),
                AccessLog.resource.ilike(pattern),
            )
        )
    total = db.scalar(select(func.count()).select_from(AccessLog).where(*filters)) or 0
    statement = (
        select(AccessLog)
        .where(*filters)
        .order_by(AccessLog.at.desc(), AccessLog.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(db.scalars(statement)), total


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
