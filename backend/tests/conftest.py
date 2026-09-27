import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.db import Base, get_db
from app.main import app
from app.modules.jd import models as jd_models  # noqa: F401
from app.modules.profile import models as profile_models  # noqa: F401
from app.modules.resume import models as resume_models  # noqa: F401
from app.modules.settings import models as settings_models  # noqa: F401
from app.modules.templates import models as templates_models  # noqa: F401
from app.tasks.seed import seed_templates

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "postgresql+psycopg://localhost:5432/resumate_test")


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """Build the schema once against the isolated test database."""
    test_engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.drop_all(test_engine)
    Base.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        seed_templates(session)
    yield test_engine
    Base.metadata.drop_all(test_engine)
    test_engine.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    """Run each test inside a transaction that is rolled back afterwards."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    def database() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db] = database
    try:
        with TestClient(app, raise_server_exceptions=False) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
