from fastapi import APIRouter, Body, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import get_current_user

from . import service
from .schemas import ImportPreviewResponse, ImportResultResponse

router = APIRouter(tags=["backup"])


@router.get("/backup/export")
def export_backup(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> dict:
    return service.export_backup(db, user.id)


@router.get("/backup/export/markdown", response_class=PlainTextResponse)
def export_markdown(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> str:
    return service.export_markdown(db, user.id)


@router.post("/backup/import:preview", response_model=ImportPreviewResponse)
def preview_import(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> ImportPreviewResponse:
    return service.preview_import(db, user.id, payload)


@router.post("/backup/import", response_model=ImportResultResponse)
def import_backup(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
) -> ImportResultResponse:
    return service.import_backup(db, user.id, payload)
