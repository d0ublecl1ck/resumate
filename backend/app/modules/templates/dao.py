from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Template


def list_templates(db: Session) -> list[Template]:
    return list(db.scalars(select(Template).order_by(Template.name)))


def get_template(db: Session, template_id: str) -> Template | None:
    return db.get(Template, template_id)
