"""Database engine, session factory, and the get_db FastAPI dependency."""

from collections.abc import Generator

from fastapi import Depends
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """Yield a SQLAlchemy session scoped to one request."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection(db: Session = Depends(get_db)) -> None:
    """Verify database connectivity in a synchronous FastAPI dependency."""

    db.execute(text("SELECT 1"))
