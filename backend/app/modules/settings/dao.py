from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import UserSettings


def get_by_owner(db: Session, owner_id: str) -> UserSettings | None:
    return db.scalar(select(UserSettings).where(UserSettings.owner_id == owner_id))


def add(db: Session, settings: UserSettings) -> None:
    db.add(settings)
