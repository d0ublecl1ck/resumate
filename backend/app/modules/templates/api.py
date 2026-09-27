from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db

from .schemas import TemplateResponse
from .service import get_template, list_templates

router = APIRouter(tags=["templates"])


@router.get("/templates", response_model=list[TemplateResponse])
def get_templates(db: Session = Depends(get_db)) -> list[TemplateResponse]:
    return list_templates(db)


@router.get("/templates/{template_id}", response_model=TemplateResponse)
def get_template_detail(template_id: str, db: Session = Depends(get_db)) -> TemplateResponse:
    return get_template(db, template_id)
