from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import require_permission

from . import service
from .models import Resume
from .schemas import (
    DocumentUpdate,
    DraftUpdate,
    ResumeCreate,
    ResumeDocument,
    ResumeLifecycle,
    ResumeResponse,
    ResumeUpdate,
    ResumeVersionResponse,
    VersionRestore,
)

router = APIRouter(tags=["resume"])


def _to_response(db: Session, owner_id: str, resume: Resume) -> ResumeResponse:
    versions = service.list_versions(db, owner_id, resume.id)
    return ResumeResponse(
        id=resume.id,
        title=resume.title,
        target_role=resume.target_role,
        tags=resume.tags,
        template_id=resume.template_id,
        template_version=resume.template_version,
        current_version_id=resume.current_version_id,
        lifecycle=resume.lifecycle,
        save_state=resume.save_state,
        updated_at=resume.updated_at,
        bound_by_jd_ids=service.list_bound_jd_ids(db, owner_id, resume.id),
        restore_deadline=resume.restore_deadline,
        profile_id=resume.profile_id,
        document=ResumeDocument.model_validate(resume.document),
        draft=ResumeDocument.model_validate(resume.draft_document) if resume.draft_document else None,
        versions=[ResumeVersionResponse.model_validate(version) for version in versions],
    )


@router.get("/resumes", response_model=list[ResumeResponse])
def get_resumes(
    lifecycle: ResumeLifecycle | None = None,
    query: str | None = None,
    tag: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> list[ResumeResponse]:
    resumes = service.list_resumes(db, user.id, lifecycle=lifecycle, query=query, tag=tag)
    return [_to_response(db, user.id, resume) for resume in resumes]


@router.post("/resumes", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
def create_resume(
    payload: ResumeCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> ResumeResponse:
    return _to_response(db, user.id, service.create_resume(db, user.id, payload))


@router.get("/resumes/{resume_id}", response_model=ResumeResponse)
def get_resume(
    resume_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> ResumeResponse:
    return _to_response(db, user.id, service.get_resume(db, user.id, resume_id))


@router.patch("/resumes/{resume_id}", response_model=ResumeResponse)
def update_resume(
    resume_id: str,
    payload: ResumeUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> ResumeResponse:
    return _to_response(db, user.id, service.update_resume(db, user.id, resume_id, payload))


@router.delete("/resumes/{resume_id}", response_model=ResumeResponse)
def delete_resume(
    resume_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> ResumeResponse:
    return _to_response(db, user.id, service.delete_resume(db, user.id, resume_id))


@router.post("/resumes/{resume_id}/archive", response_model=ResumeResponse)
def archive_resume(
    resume_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> ResumeResponse:
    return _to_response(db, user.id, service.archive_resume(db, user.id, resume_id))


@router.post("/resumes/{resume_id}/restore", response_model=ResumeResponse)
def restore_resume(
    resume_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> ResumeResponse:
    return _to_response(db, user.id, service.restore_resume(db, user.id, resume_id))


@router.post("/resumes/{resume_id}/duplicate", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
def duplicate_resume(
    resume_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> ResumeResponse:
    return _to_response(db, user.id, service.duplicate_resume(db, user.id, resume_id))


@router.get("/resumes/{resume_id}/document", response_model=ResumeDocument)
def get_document(
    resume_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> ResumeDocument:
    return ResumeDocument.model_validate(service.get_document(db, user.id, resume_id))


@router.put("/resumes/{resume_id}/document", response_model=ResumeResponse)
def update_document(
    resume_id: str,
    payload: DocumentUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> ResumeResponse:
    return _to_response(db, user.id, service.update_document(db, user.id, resume_id, payload))


@router.put("/resumes/{resume_id}/draft", response_model=ResumeResponse)
def save_draft(
    resume_id: str,
    payload: DraftUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> ResumeResponse:
    return _to_response(db, user.id, service.save_draft(db, user.id, resume_id, payload))


@router.get("/resumes/{resume_id}/versions", response_model=list[ResumeVersionResponse])
def get_versions(
    resume_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> list[ResumeVersionResponse]:
    return [ResumeVersionResponse.model_validate(version) for version in service.list_versions(db, user.id, resume_id)]

@router.post("/resumes/{resume_id}/versions/{version_id}/restore", response_model=ResumeResponse)
def restore_version(
    resume_id: str,
    version_id: str,
    payload: VersionRestore,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> ResumeResponse:
    """以 source=restore 生成新版本，历史版本全部保留（C-03）。"""
    return _to_response(db, user.id, service.restore_version(db, user.id, resume_id, version_id, payload.message))


def _attachment_disposition(title: str) -> str:
    """RFC 5987: an ASCII fallback plus a UTF-8 filename, safe for any title."""
    filename = f"{title or 'resume'}.md"
    ascii_title = "".join(
        char for char in title if char.isascii() and (char.isalnum() or char in "._- ")
    ).strip(" ._-") or "resume"
    return f"attachment; filename=\"{ascii_title}.md\"; filename*=UTF-8''{quote(filename, safe='')}"


@router.get("/resumes/{resume_id}/export")
def export_resume(
    resume_id: str,
    format: Literal["markdown"] = Query("markdown"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> Response:
    markdown, title = service.export_markdown(db, user.id, resume_id)
    return Response(
        content=markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": _attachment_disposition(title)},
    )

