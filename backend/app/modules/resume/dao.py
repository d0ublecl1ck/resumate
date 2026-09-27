from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import Resume, ResumeVersion


def list_resumes(
    db: Session,
    owner_id: str,
    *,
    lifecycle: str | None = None,
    query: str | None = None,
    tag: str | None = None,
) -> list[Resume]:
    statement = select(Resume).where(Resume.owner_id == owner_id)
    if lifecycle is None:
        statement = statement.where(Resume.lifecycle != "deleted")
    else:
        statement = statement.where(Resume.lifecycle == lifecycle)
    if query:
        pattern = f"%{query}%"
        statement = statement.where(or_(Resume.title.ilike(pattern), Resume.target_role.ilike(pattern)))
    statement = statement.order_by(Resume.updated_at.desc())
    items = list(db.scalars(statement))
    if tag:
        items = [resume for resume in items if tag in resume.tags]
    return items


def get_resume(db: Session, resume_id: str) -> Resume | None:
    return db.get(Resume, resume_id)


def add_resume(db: Session, resume: Resume) -> None:
    db.add(resume)


def list_versions(db: Session, resume_id: str) -> list[ResumeVersion]:
    statement = (
        select(ResumeVersion)
        .where(ResumeVersion.resume_id == resume_id)
        .order_by(ResumeVersion.committed_at)
    )
    return list(db.scalars(statement))


def add_version(db: Session, version: ResumeVersion) -> None:
    db.add(version)
