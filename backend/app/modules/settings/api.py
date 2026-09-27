from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import get_current_user

from . import service
from .schemas import (
    AgentConfigResponse,
    AgentConfigUpdate,
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
    user: CurrentUser = Depends(get_current_user),
) -> UserPreferencesResponse:
    return service.get_preferences(db, user)


@router.patch("/settings", response_model=UserPreferencesResponse)
def update_preferences(
    payload: UserPreferencesUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> UserPreferencesResponse:
    return service.update_preferences(db, user, payload)


@router.get("/agent/config", response_model=AgentConfigResponse)
def get_agent_config(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> AgentConfigResponse:
    return service.get_agent_config(db, user)


@router.patch("/agent/config", response_model=AgentConfigResponse)
def update_agent_config(
    payload: AgentConfigUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> AgentConfigResponse:
    return service.update_agent_config(db, user, payload)


@router.get("/models/config", response_model=ModelConfigResponse)
def get_model_config(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> ModelConfigResponse:
    return service.get_model_config(db, user)


@router.put("/models/config", response_model=ModelConfigResponse)
def update_model_config(
    payload: ModelConfigUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> ModelConfigResponse:
    return service.update_model_config(db, user, payload)


@router.post("/models/config:test", response_model=ModelTestResult)
def test_model_config(
    payload: ModelConfigUpdate | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> ModelTestResult:
    return service.test_model_connection(db, user, payload)
