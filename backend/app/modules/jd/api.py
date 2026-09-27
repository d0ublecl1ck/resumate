from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import get_current_user

from . import service
from .models import JobDescription
from .schemas import BindingUpdate, JobDescriptionCreate, JobDescriptionResponse, JobDescriptionUpdate

router = APIRouter(tags=["jd"])


def _to_response(db: Session, jd: JobDescription) -> JobDescriptionResponse:
    return JobDescriptionResponse(
        id=jd.id,
        owner_id=jd.owner_id,
        role=jd.role,
        company=jd.company,
        body=jd.body,
        source_url=jd.source_url,
        tags=jd.tags,
        revision=jd.revision,
        created_at=jd.created_at,
        updated_at=jd.updated_at,
        bound_resume_id=jd.bound_resume_id,
        bound_resume_available=service.bound_resume_available(db, jd),
    )


@router.get("/jds", response_model=list[JobDescriptionResponse])
def get_jds(
    query: str | None = None,
    tag: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[JobDescriptionResponse]:
    return [_to_response(db, jd) for jd in service.list_jds(db, user.id, query=query, tag=tag)]


@router.post("/jds", response_model=JobDescriptionResponse, status_code=status.HTTP_201_CREATED)
def create_jd(
    payload: JobDescriptionCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> JobDescriptionResponse:
    return _to_response(db, service.create_jd(db, user.id, payload))


@router.get("/jds/{jd_id}", response_model=JobDescriptionResponse)
def get_jd(
    jd_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> JobDescriptionResponse:
    return _to_response(db, service.get_jd(db, user.id, jd_id))


@router.patch("/jds/{jd_id}", response_model=JobDescriptionResponse)
def update_jd(
    jd_id: str,
    payload: JobDescriptionUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> JobDescriptionResponse:
    return _to_response(db, service.update_jd(db, user.id, jd_id, payload))


@router.delete("/jds/{jd_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_jd(
    jd_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> None:
    service.delete_jd(db, user.id, jd_id)


@router.put("/jds/{jd_id}/binding", response_model=JobDescriptionResponse)
def set_binding(
    jd_id: str,
    payload: BindingUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> JobDescriptionResponse:
    return _to_response(db, service.set_binding(db, user.id, jd_id, payload.resume_id))


@router.delete("/jds/{jd_id}/binding", response_model=JobDescriptionResponse)
def release_binding(
    jd_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> JobDescriptionResponse:
    return _to_response(db, service.release_binding(db, user.id, jd_id))
