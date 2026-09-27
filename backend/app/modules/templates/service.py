from sqlalchemy.orm import Session

from app.shared.errors import ResourceNotFound

from . import dao
from .models import Template


def list_templates(db: Session) -> list[Template]:
    return dao.list_templates(db)


def get_template(db: Session, template_id: str) -> Template:
    template = dao.get_template(db, template_id)
    if template is None:
        raise ResourceNotFound(f"模板 {template_id} 不存在")
    return template
