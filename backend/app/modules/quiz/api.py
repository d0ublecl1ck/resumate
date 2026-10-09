from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import require_permission

from . import service
from .schemas import QuizAnswerCreate, QuizAnswerResult, QuizAttemptCreate, QuizAttemptDetail

# 笔试消费岗位与题库素材，沿用面试模块的岗位域权限（jd:read / jd:write），
# 不新增权限码，避免改动 RBAC 目录。
router = APIRouter(tags=["quiz"])


@router.post("/quiz/attempts", response_model=QuizAttemptDetail, status_code=status.HTTP_201_CREATED)
def create_quiz_attempt(
    payload: QuizAttemptCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> QuizAttemptDetail:
    return service.create_attempt(db, user.id, payload)


@router.get("/quiz/attempts/{attempt_id}", response_model=QuizAttemptDetail)
def get_quiz_attempt(
    attempt_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> QuizAttemptDetail:
    return service.get_detail(db, user.id, attempt_id)


@router.post("/quiz/attempts/{attempt_id}/answers", response_model=QuizAnswerResult)
def submit_quiz_answer(
    attempt_id: str,
    payload: QuizAnswerCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> QuizAnswerResult:
    return service.submit_answer(db, user.id, attempt_id, payload)


@router.post("/quiz/attempts/{attempt_id}/submit", response_model=QuizAttemptDetail)
def submit_quiz_attempt(
    attempt_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> QuizAttemptDetail:
    return service.submit_attempt(db, user.id, attempt_id)
