from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import require_permission

from . import service
from .schemas import (
    InterviewAnswerCreate,
    InterviewAnswerResult,
    InterviewReportView,
    InterviewSessionCreate,
    InterviewSessionDetail,
    InterviewSessionSummary,
)

# 面试能力挂在岗位域权限下（jd:read / jd:write）：它消费的是 JD 与简历版本，
# 不新增权限码，避免改动 RBAC 目录。
router = APIRouter(tags=["interview"])


@router.get("/interview/sessions", response_model=list[InterviewSessionSummary])
def list_interview_sessions(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> list[InterviewSessionSummary]:
    return service.list_sessions(db, user.id)


@router.post("/interview/sessions", response_model=InterviewSessionDetail, status_code=status.HTTP_201_CREATED)
def create_interview_session(
    payload: InterviewSessionCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> InterviewSessionDetail:
    return service.create_session(db, user.id, payload)


@router.get("/interview/sessions/{session_id}", response_model=InterviewSessionDetail)
def get_interview_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> InterviewSessionDetail:
    return service.get_detail(db, user.id, session_id)


@router.post("/interview/sessions/{session_id}/answers", response_model=InterviewAnswerResult)
def submit_interview_answer(
    session_id: str,
    payload: InterviewAnswerCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> InterviewAnswerResult:
    return service.submit_answer(db, user.id, session_id, payload)


@router.post("/interview/sessions/{session_id}/finish", response_model=InterviewReportView)
def finish_interview_session(
    session_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> InterviewReportView:
    return service.finish_session(db, user.id, session_id)


@router.get("/interview/sessions/{session_id}/report", response_model=InterviewReportView)
def get_interview_report(
    session_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> InterviewReportView:
    return service.get_report(db, user.id, session_id)
