from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.modules.resume.dao import get_resume
from app.shared.errors import ResourceNotFound, ValidationFailed

from . import dao, parser
from .models import JobDescription
from .schemas import (
    JdParseRequest,
    JobDescriptionCreate,
    JobDescriptionUpdate,
    ProposedJdResponse,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return f"jd_{uuid4().hex[:12]}"


def _get_owned(db: Session, owner_id: str, jd_id: str) -> JobDescription:
    jd = dao.get_jd(db, jd_id)
    if jd is None or jd.owner_id != owner_id:
        raise ResourceNotFound(f"岗位 {jd_id} 不存在")
    return jd


def list_jds(db: Session, owner_id: str, *, query: str | None, tag: str | None) -> list[JobDescription]:
    return dao.list_jds(db, owner_id, query=query, tag=tag)


def get_jd(db: Session, owner_id: str, jd_id: str) -> JobDescription:
    return _get_owned(db, owner_id, jd_id)


def create_jd(db: Session, owner_id: str, payload: JobDescriptionCreate) -> JobDescription:
    now = _now()
    jd = JobDescription(
        id=_new_id(),
        owner_id=owner_id,
        role=payload.role,
        company=payload.company,
        body=payload.body,
        source_url=payload.source_url,
        tags=list(payload.tags),
        revision=1,
        bound_resume_id=None,
        created_at=now,
        updated_at=now,
    )
    dao.add_jd(db, jd)
    db.commit()
    db.refresh(jd)
    return jd


def update_jd(db: Session, owner_id: str, jd_id: str, payload: JobDescriptionUpdate) -> JobDescription:
    jd = _get_owned(db, owner_id, jd_id)
    for attribute in ("role", "company", "body", "source_url", "tags"):
        value = getattr(payload, attribute)
        if value is not None:
            setattr(jd, attribute, list(value) if attribute == "tags" else value)
    jd.revision += 1
    jd.updated_at = _now()
    db.commit()
    db.refresh(jd)
    return jd


def delete_jd(db: Session, owner_id: str, jd_id: str) -> None:
    jd = _get_owned(db, owner_id, jd_id)
    db.delete(jd)
    db.commit()


def _require_bindable_resume(db: Session, owner_id: str, resume_id: str) -> None:
    resume = get_resume(db, resume_id)
    if resume is None or resume.owner_id != owner_id:
        raise ResourceNotFound(f"简历 {resume_id} 不存在")
    if resume.lifecycle == "deleted":
        raise ValidationFailed("目标简历已删除，不能绑定")


def set_binding(db: Session, owner_id: str, jd_id: str, resume_id: str) -> JobDescription:
    jd = _get_owned(db, owner_id, jd_id)
    _require_bindable_resume(db, owner_id, resume_id)
    jd.bound_resume_id = resume_id
    jd.updated_at = _now()
    db.commit()
    db.refresh(jd)
    return jd


def release_binding(db: Session, owner_id: str, jd_id: str) -> JobDescription:
    jd = _get_owned(db, owner_id, jd_id)
    jd.bound_resume_id = None
    jd.updated_at = _now()
    db.commit()
    db.refresh(jd)
    return jd


def parse_text(db: Session, owner_id: str, payload: JdParseRequest) -> ProposedJdResponse:
    """POST /jds:parse-text：用用户已配置的模型把粘贴文本结构化成草案。"""
    return parser.parse_jd_text(db, owner_id, text=payload.text)


def bound_resume_available(db: Session, jd: JobDescription) -> bool | None:
    if jd.bound_resume_id is None:
        return None
    resume = get_resume(db, jd.bound_resume_id)
    return bool(resume and resume.owner_id == jd.owner_id and resume.lifecycle != "deleted")
