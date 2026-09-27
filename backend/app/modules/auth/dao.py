from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import User


def get_user(db: Session, user_id: str) -> User | None:
    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def add_user(db: Session, user: User) -> None:
    db.add(user)
