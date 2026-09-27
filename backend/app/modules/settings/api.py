from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import require_permission

from . import service
from .schemas import (
    AgentConfigResponse,
    AgentConfigUpdate,
    ModelCatalogResponse,
    ModelConfigResponse,
    ModelConfigUpdate,
    ModelTestResult,
    UserPreferencesResponse,
    UserPreferencesUpdate,
)

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=UserPreferencesResponse)
def get_preferences(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("settings:read")),
) -> UserPreferencesResponse:
    return service.get_preferences(db, user)


@router.patch("/settings", response_model=UserPreferencesResponse)
def update_preferences(
    payload: UserPreferencesUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("settings:write")),
) -> UserPreferencesResponse:
    return service.update_preferences(db, user, payload)


@router.get("/agent/config", response_model=AgentConfigResponse)
def get_agent_config(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("settings:read")),
) -> AgentConfigResponse:
    return service.get_agent_config(db, user)


@router.patch("/agent/config", response_model=AgentConfigResponse)
def update_agent_config(
    payload: AgentConfigUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("settings:write")),
) -> AgentConfigResponse:
    return service.update_agent_config(db, user, payload)


@router.get("/models/config", response_model=ModelConfigResponse)
def get_model_config(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("settings:read")),
) -> ModelConfigResponse:
    return service.get_model_config(db, user)


@router.get("/models/catalog", response_model=ModelCatalogResponse)
def get_model_catalog(
    provider: str | None = Query(default=None, description="Filter by models.dev provider id."),
    q: str | None = Query(default=None, description="Case-insensitive model id/name search."),
    _user: CurrentUser = Depends(require_permission("settings:read")),
) -> ModelCatalogResponse:
    return service.get_model_catalog(provider=provider, query=q)


@router.put("/models/config", response_model=ModelConfigResponse)
def update_model_config(
    payload: ModelConfigUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("settings:write")),
) -> ModelConfigResponse:
    return service.update_model_config(db, user, payload)


@router.post("/models/config:test", response_model=ModelTestResult)
def test_model_config(
    payload: ModelConfigUpdate | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("settings:write")),
) -> ModelTestResult:
    return service.test_model_connection(db, user, payload)
