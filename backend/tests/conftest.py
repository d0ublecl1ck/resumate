import os
from collections.abc import Iterator

# 测试用 FastAPI 依赖覆盖把真实 SMTP 换成内存 fake mailer，CI 上也没有
# backend/.env；这里显式打开启动自检的逃生阀，保证「无邮件配置」不判死。
# 自检本身的行为由 tests/test_startup_config.py 单独覆盖。
os.environ.setdefault("RESUMATE_ALLOW_MISSING_ENV", "1")

import fakeredis
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.core.db import Base, get_db
from app.core.deps import CurrentUser
from app.core.redis import get_redis
from app.main import app
from app.modules.access import models as access_models  # noqa: F401
from app.modules.auth import models as auth_models  # noqa: F401
from app.modules.auth.deps import get_current_user
from app.modules.auth.mailer import get_mailer
from app.modules.auth.rbac import PERMISSION_CODES
from app.modules.interview import models as interview_models  # noqa: F401
from app.modules.jd import models as jd_models  # noqa: F401
from app.modules.profile import models as profile_models  # noqa: F401
from app.modules.resume import models as resume_models  # noqa: F401
from app.modules.settings import models as settings_models  # noqa: F401
from app.modules.templates import models as templates_models  # noqa: F401
from app.tasks.seed import seed_rbac, seed_templates

import support

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "postgresql+psycopg://localhost:5432/resumate_test")
# Business-module tests bypass the real cookie flow; grant every permission so
# each case can focus on its own concern. Auth/RBAC cases use session_clients.
TEST_USER = CurrentUser(
    id="user_test",
    display_name="测试用户",
    role="super_admin",
    roles=("super_admin",),
    permissions=frozenset(PERMISSION_CODES),
)


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """Build the schema once against the isolated test database."""
    test_engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.drop_all(test_engine)
    Base.metadata.create_all(test_engine)
    with Session(test_engine) as session:
        seed_templates(session)
        seed_rbac(session)
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
def fake_redis() -> Iterator[fakeredis.FakeRedis]:
    client = fakeredis.FakeRedis(decode_responses=True)
    try:
        yield client
    finally:
        client.flushall()


def _database_override(db_session: Session):
    def database() -> Iterator[Session]:
        yield db_session

    return database


@pytest.fixture
def session_clients(db_session: Session, fake_redis: fakeredis.FakeRedis):
    """Factory for clients that exercise the real cookie + Redis session flow."""
    app.dependency_overrides[get_db] = _database_override(db_session)
    app.dependency_overrides[get_redis] = lambda: fake_redis
    # Registration now sends verification mail; capture it instead of using SMTP.
    app.dependency_overrides[get_mailer] = support.get_fake_mailer
    support.reset_mailer()
    created: list[TestClient] = []

    def make() -> TestClient:
        client = TestClient(app, raise_server_exceptions=False)
        created.append(client)
        return client

    try:
        yield make
    finally:
        for client in created:
            client.close()
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(get_mailer, None)


@pytest.fixture
def client(db_session: Session, fake_redis: fakeredis.FakeRedis) -> Iterator[TestClient]:
    """Business-module client with the current user stubbed; auth is tested separately."""
    app.dependency_overrides[get_db] = _database_override(db_session)
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_current_user] = lambda: TEST_USER
    try:
        with TestClient(app, raise_server_exceptions=False) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(get_current_user, None)
