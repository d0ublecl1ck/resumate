from alembic import context

from app.core.config import get_settings
from app.core.db import Base, engine
from app.modules.jd import models as jd_models  # noqa: F401
from app.modules.profile import models as profile_models  # noqa: F401
from app.modules.resume import models as resume_models  # noqa: F401
from app.modules.templates import models as templates_models  # noqa: F401

# Import each business model module explicitly here before autogeneration.
target_metadata = Base.metadata

if context.is_offline_mode():
    context.configure(
        url=get_settings().database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
