from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser, PaginationParams, get_pagination
from app.modules.auth.deps import require_permission

from . import service
from .schemas import (
    AccessLogResponse,
    AccessResult,
    CapabilityDiscoveryResponse,
    PersonalAccessTokenCreate,
    PersonalAccessTokenResponse,
)

router = APIRouter(tags=["access"])


@router.get("/access/tokens", response_model=list[PersonalAccessTokenResponse])
def get_tokens(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("access:read")),
) -> list[PersonalAccessTokenResponse]:
    return service.list_tokens(db, user)


@router.post("/access/tokens", response_model=PersonalAccessTokenResponse, status_code=status.HTTP_201_CREATED)
def create_token(
    payload: PersonalAccessTokenCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("access:write")),
) -> PersonalAccessTokenResponse:
    return service.create_token(db, user, payload)


@router.post("/access/tokens/{token_id}/revoke", response_model=PersonalAccessTokenResponse)
def revoke_token(
    token_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("access:write")),
) -> PersonalAccessTokenResponse:
    return service.revoke_token(db, user, token_id)


@router.get("/access/logs", response_model=list[AccessLogResponse])
def get_logs(
    response: Response,
    purpose: str | None = Query(None, max_length=200),
    result: AccessResult | None = Query(None),
    q: str | None = Query(None, max_length=200),
    from_at: datetime | None = Query(None, alias="from"),
    to_at: datetime | None = Query(None, alias="to"),
    pagination: PaginationParams = Depends(get_pagination),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("access:read")),
) -> list[AccessLogResponse]:
    logs, total = service.list_logs(
        db,
        user,
        purpose=purpose,
        result=result,
        query=q,
        from_at=from_at,
        to_at=to_at,
        page=pagination.page,
        size=pagination.size,
    )
    # 分页元数据走响应头：响应体保持裸数组，与仓库其它列表端点一致。
    response.headers["X-Total-Count"] = str(total)
    return logs


@router.get("/.well-known/resume-agent", response_model=CapabilityDiscoveryResponse)
def capability(request: Request) -> CapabilityDiscoveryResponse:
    return service.capability(str(request.base_url))
