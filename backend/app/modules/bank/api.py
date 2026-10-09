from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser, PaginationParams, get_pagination
from app.modules.auth.deps import require_permission

from . import service
from .schemas import (
    BankDifficulty,
    BankImportResult,
    BankKind,
    BankQuestionImport,
    BankQuestionView,
    BankStats,
)

# 题库是 A11 面试能力的公共素材：读沿用通用读权限 resume:read，导入沿用写权限
# resume:write，不新增权限码，避免改动 RBAC 目录。
router = APIRouter(tags=["bank"])


@router.get("/bank/stats", response_model=BankStats)
def get_bank_stats(
    role: str | None = Query(None, max_length=200),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> BankStats:
    return service.get_stats(db, role=role)


@router.get("/bank/questions", response_model=list[BankQuestionView])
def list_bank_questions(
    response: Response,
    role: str | None = Query(None, max_length=200),
    kind: BankKind | None = Query(None),
    difficulty: BankDifficulty | None = Query(None),
    q: str | None = Query(None, max_length=200),
    pagination: PaginationParams = Depends(get_pagination),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> list[BankQuestionView]:
    items, total = service.list_questions(
        db,
        role=role,
        kind=kind,
        difficulty=difficulty,
        query=q,
        page=pagination.page,
        size=pagination.size,
    )
    # 分页元数据走响应头：响应体保持裸数组，与仓库其它列表端点一致。
    response.headers["X-Total-Count"] = str(total)
    return items


@router.post("/bank/import", response_model=BankImportResult, status_code=status.HTTP_201_CREATED)
def import_bank_questions(
    payload: list[BankQuestionImport],
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> BankImportResult:
    return service.import_questions(db, payload)
