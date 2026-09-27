from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import JobDescription


def list_jds(db: Session, owner_id: str, *, query: str | None = None, tag: str | None = None) -> list[JobDescription]:
    statement = select(JobDescription).where(JobDescription.owner_id == owner_id)
    if query:
        pattern = f"%{query}%"
        statement = statement.where(or_(JobDescription.role.ilike(pattern), JobDescription.company.ilike(pattern)))
    statement = statement.order_by(JobDescription.updated_at.desc())
    items = list(db.scalars(statement))
    if tag:
        items = [jd for jd in items if tag in jd.tags]
    return items


def get_jd(db: Session, jd_id: str) -> JobDescription | None:
    return db.get(JobDescription, jd_id)


def add_jd(db: Session, jd: JobDescription) -> None:
    db.add(jd)


def list_jd_ids_for_resume(db: Session, owner_id: str, resume_id: str) -> list[str]:
    statement = select(JobDescription.id).where(
        JobDescription.owner_id == owner_id,
        JobDescription.bound_resume_id == resume_id,
    )
    return list(db.scalars(statement))
