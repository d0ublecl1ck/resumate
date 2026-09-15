from collections.abc import Generator

from fastapi import Depends
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


engine = create_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    """Close each request's session even when downstream work fails."""
    with SessionLocal() as session:
        yield session


def check_database_connection(db: Session = Depends(get_db)) -> None:
    """Run synchronous database I/O as a FastAPI dependency."""
    db.execute(text("SELECT 1"))
