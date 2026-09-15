from fastapi import APIRouter, Depends

from app.core.db import check_database_connection

from .schemas import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/", response_model=HealthResponse, dependencies=[Depends(check_database_connection)])
async def get_health() -> HealthResponse:
    return HealthResponse(status="ok")
