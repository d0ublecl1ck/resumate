from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import require_permission

from . import service
from .schemas import KbDocumentCreate, KbDocumentView, KbSearchResult

# 知识库是 A11 面试能力的公共素材：读沿用通用读权限 resume:read，导入沿用写权限
# resume:write，不新增权限码，避免改动 RBAC 目录。
router = APIRouter(tags=["kb"])


@router.get("/kb/documents", response_model=list[KbDocumentView])
def list_kb_documents(
    role: str | None = Query(None, max_length=200),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> list[KbDocumentView]:
    return service.list_documents(db, role=role)


@router.post("/kb/documents", response_model=KbDocumentView, status_code=status.HTTP_201_CREATED)
def import_kb_document(
    payload: KbDocumentCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:write")),
) -> KbDocumentView:
    return service.import_document(db, payload)


@router.get("/kb/search", response_model=KbSearchResult)
def search_kb(
    q: str = Query(..., min_length=1, max_length=2000),
    role: str | None = Query(None, max_length=200),
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("resume:read")),
) -> KbSearchResult:
    return service.search(db, query=q, role=role, limit=limit)
