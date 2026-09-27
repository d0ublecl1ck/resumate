from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import get_current_user

from . import service
from .schemas import (
    AccessLogResponse,
    CapabilityDiscoveryResponse,
    PersonalAccessTokenCreate,
    PersonalAccessTokenResponse,
)

router = APIRouter(tags=["access"])


@router.get("/access/tokens", response_model=list[PersonalAccessTokenResponse])
def get_tokens(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[PersonalAccessTokenResponse]:
    return service.list_tokens(db, user)


@router.post("/access/tokens", response_model=PersonalAccessTokenResponse, status_code=status.HTTP_201_CREATED)
def create_token(
    payload: PersonalAccessTokenCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> PersonalAccessTokenResponse:
    return service.create_token(db, user, payload)


@router.post("/access/tokens/{token_id}/revoke", response_model=PersonalAccessTokenResponse)
def revoke_token(
    token_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> PersonalAccessTokenResponse:
    return service.revoke_token(db, user, token_id)


@router.get("/access/logs", response_model=list[AccessLogResponse])
def get_logs(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> list[AccessLogResponse]:
    return service.list_logs(db, user)


@router.get("/.well-known/resume-agent", response_model=CapabilityDiscoveryResponse)
def capability(request: Request) -> CapabilityDiscoveryResponse:
    return service.capability(str(request.base_url))
