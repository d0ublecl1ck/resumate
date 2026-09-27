import copy
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.modules.jd import dao as jd_dao
from app.modules.templates.service import get_template
from app.shared.errors import BaseVersionStale, ResourceNotFound, ValidationFailed

from . import dao
from .models import Resume, ResumeVersion
from .schemas import DocumentUpdate, ResumeCreate, ResumeDocument, ResumeUpdate

RESTORE_WINDOW_DAYS = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _require_published_template(db: Session, template_id: str) -> None:
    template = get_template(db, template_id)
    if template.status != "published":
        raise ValidationFailed(f"模板 {template_id} 未发布，不能用于新简历")


def _get_owned(db: Session, owner_id: str, resume_id: str) -> Resume:
    resume = dao.get_resume(db, resume_id)
    if resume is None or resume.owner_id != owner_id:
        raise ResourceNotFound(f"简历 {resume_id} 不存在")
    return resume


def _document_payload(document: ResumeDocument | None) -> dict:
    if document is None:
        return ResumeDocument().model_dump(by_alias=True)
    return document.model_dump(by_alias=True, exclude_none=True)


def summarize_changes(before: dict, after: dict) -> tuple[int, list[str]]:
    before_sections = {section["id"]: section for section in before.get("sections", [])}
    after_sections = {section["id"]: section for section in after.get("sections", [])}
    changed = [section.get("title", section_id) for section_id, section in after_sections.items() if before_sections.get(section_id) != section]
    changed.extend(before_sections[section_id].get("title", section_id) for section_id in before_sections if section_id not in after_sections)
    if before.get("basics") != after.get("basics"):
        changed.append("基础信息")
    return len(changed), changed


def _commit_version(
    db: Session,
    resume: Resume,
    document: dict,
    *,
    source: str,
    actor_id: str,
    message: str,
    base_version_id: str | None = None,
    client_id: str | None = None,
    conversation_id: str | None = None,
    user_turn_id: str | None = None,
    agent_run_id: str | None = None,
    execution_mode: str | None = None,
) -> ResumeVersion:
    change_count, affected_sections = summarize_changes(resume.document or {}, document)
    now = _now()
    version = ResumeVersion(
        id=_new_id("ver"),
        resume_id=resume.id,
        source=source,
        actor_id=actor_id,
        message=message,
        change_count=change_count,
        affected_sections=affected_sections,
        snapshot=document,
        parent_version_id=resume.current_version_id,
        base_version_id=base_version_id,
        client_id=client_id,
        conversation_id=conversation_id,
        user_turn_id=user_turn_id,
        agent_run_id=agent_run_id,
        execution_mode=execution_mode,
        started_at=now,
        committed_at=now,
    )
    resume.document = document
    resume.current_version_id = version.id
    resume.save_state = "committed"
    resume.updated_at = now
    dao.add_version(db, version)
    return version


def read_working_document(resume: Resume) -> dict:
    """Return the staged Working Copy, falling back to the committed document."""
    if resume.working_document is not None:
        return copy.deepcopy(resume.working_document)
    return copy.deepcopy(resume.document or {})


def working_copy_is_dirty(resume: Resume) -> bool:
    """True when a staged document exists and differs from the committed one."""
    return resume.working_document is not None and (resume.working_document or {}) != (resume.document or {})


def stage_working_document(
    resume: Resume,
    document: dict,
    *,
    turn_id: str,
    base_version_id: str | None,
) -> None:
    """Stage a candidate document for one turn; each staged apply bumps working_revision."""
    if resume.working_turn_id == turn_id and resume.working_document is not None:
        resume.working_revision = (resume.working_revision or 0) + 1
    else:
        resume.working_revision = 1
    resume.working_document = document
    resume.working_turn_id = turn_id
    resume.working_base_version_id = base_version_id


def commit_working_copy(
    db: Session,
    resume: Resume,
    *,
    actor_id: str,
    message: str,
    source: str = "agent",
    client_id: str | None = None,
    user_turn_id: str | None = None,
    execution_mode: str | None = None,
) -> ResumeVersion | None:
    """Aggregate the Working Copy into exactly one version; None when unchanged."""
    if not working_copy_is_dirty(resume):
        clear_working_copy(resume)
        return None
    document = copy.deepcopy(resume.working_document)
    version = _commit_version(
        db,
        resume,
        document,
        source=source,
        actor_id=actor_id,
        message=message,
        base_version_id=resume.working_base_version_id,
        client_id=client_id,
        user_turn_id=user_turn_id,
        execution_mode=execution_mode,
    )
    clear_working_copy(resume)
    return version


def get_version_snapshot(db: Session, version_id: str | None) -> dict | None:
    """Return a deep copy of a version snapshot, or None when it is unknown."""
    if version_id is None:
        return None
    version = dao.get_version(db, version_id)
    if version is None:
        return None
    return copy.deepcopy(version.snapshot or {})


def clear_working_copy(resume: Resume) -> None:
    """Drop any staged document so the resume reads from the committed version."""
    resume.working_document = None
    resume.working_base_version_id = None
    resume.working_turn_id = None
    resume.working_revision = 0


def list_resumes(db: Session, owner_id: str, *, lifecycle: str | None, query: str | None, tag: str | None) -> list[Resume]:
    return dao.list_resumes(db, owner_id, lifecycle=lifecycle, query=query, tag=tag)


def get_resume(db: Session, owner_id: str, resume_id: str) -> Resume:
    return _get_owned(db, owner_id, resume_id)


def create_resume(db: Session, owner_id: str, payload: ResumeCreate) -> Resume:
    _require_published_template(db, payload.template_id)
    now = _now()
    resume = Resume(
        id=_new_id("res"),
        owner_id=owner_id,
        profile_id=payload.profile_id,
        title=payload.title,
        target_role=payload.target_role,
        tags=list(payload.tags),
        template_id=payload.template_id,
        template_version=get_template(db, payload.template_id).revision,
        current_version_id=None,
        lifecycle="active",
        save_state="committed",
        document={},
        created_at=now,
        updated_at=now,
    )
    dao.add_resume(db, resume)
    db.flush()
    _commit_version(db, resume, _document_payload(payload.document), source="manual", actor_id=owner_id, message="创建简历")
    db.commit()
    db.refresh(resume)
    return resume


def update_resume(db: Session, owner_id: str, resume_id: str, payload: ResumeUpdate) -> Resume:
    resume = _get_owned(db, owner_id, resume_id)
    if payload.template_id is not None:
        _require_published_template(db, payload.template_id)
        resume.template_id = payload.template_id
        resume.template_version = get_template(db, payload.template_id).revision
    if payload.title is not None:
        resume.title = payload.title
    if payload.target_role is not None:
        resume.target_role = payload.target_role
    if payload.tags is not None:
        resume.tags = list(payload.tags)
    resume.updated_at = _now()
    db.commit()
    db.refresh(resume)
    return resume


def delete_resume(db: Session, owner_id: str, resume_id: str) -> Resume:
    resume = _get_owned(db, owner_id, resume_id)
    resume.lifecycle = "deleted"
    resume.restore_deadline = _now() + timedelta(days=RESTORE_WINDOW_DAYS)
    resume.updated_at = _now()
    db.commit()
    db.refresh(resume)
    return resume


def archive_resume(db: Session, owner_id: str, resume_id: str) -> Resume:
    resume = _get_owned(db, owner_id, resume_id)
    resume.lifecycle = "archived"
    resume.restore_deadline = None
    resume.updated_at = _now()
    db.commit()
    db.refresh(resume)
    return resume


def restore_resume(db: Session, owner_id: str, resume_id: str) -> Resume:
    resume = _get_owned(db, owner_id, resume_id)
    if resume.lifecycle == "active":
        raise ValidationFailed("简历已是活跃状态，无需恢复")
    if resume.lifecycle == "deleted" and resume.restore_deadline is not None and _now() > resume.restore_deadline:
        raise ValidationFailed("已超过恢复期限，无法恢复")
    resume.lifecycle = "active"
    resume.restore_deadline = None
    resume.updated_at = _now()
    db.commit()
    db.refresh(resume)
    return resume


def duplicate_resume(db: Session, owner_id: str, resume_id: str) -> Resume:
    source = _get_owned(db, owner_id, resume_id)
    now = _now()
    clone = Resume(
        id=_new_id("res"),
        owner_id=owner_id,
        profile_id=source.profile_id,
        title=f"{source.title}（副本）",
        target_role=source.target_role,
        tags=list(source.tags),
        template_id=source.template_id,
        template_version=source.template_version,
        current_version_id=None,
        lifecycle="active",
        save_state="committed",
        document={},
        created_at=now,
        updated_at=now,
    )
    dao.add_resume(db, clone)
    db.flush()
    _commit_version(
        db,
        clone,
        copy.deepcopy(source.document or {}),
        source="manual",
        actor_id=owner_id,
        message=f"复制自 {source.title}",
    )
    db.commit()
    db.refresh(clone)
    return clone


def get_document(db: Session, owner_id: str, resume_id: str) -> dict:
    return _get_owned(db, owner_id, resume_id).document


def update_document(db: Session, owner_id: str, resume_id: str, payload: DocumentUpdate) -> Resume:
    resume = _get_owned(db, owner_id, resume_id)
    if payload.base_version_id is not None and payload.base_version_id != resume.current_version_id:
        raise BaseVersionStale("简历内容已更新，请基于最新版本重试", latest_version_id=resume.current_version_id)
    document = _document_payload(payload.document)
    if document == (resume.document or {}):
        return resume
    previous_version_id = resume.current_version_id
    _commit_version(
        db,
        resume,
        document,
        source="manual",
        actor_id=owner_id,
        message=payload.message or "手动编辑",
        base_version_id=previous_version_id,
    )
    db.commit()
    db.refresh(resume)
    return resume


def list_versions(db: Session, owner_id: str, resume_id: str) -> list[ResumeVersion]:
    _get_owned(db, owner_id, resume_id)
    return dao.list_versions(db, resume_id)


def list_bound_jd_ids(db: Session, owner_id: str, resume_id: str) -> list[str]:
    return jd_dao.list_jd_ids_for_resume(db, owner_id, resume_id)
