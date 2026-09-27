"""Seed built-in reference data and the local bootstrap admin.

Run with: uv run python -m app.tasks.seed
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.modules.auth.dao import get_user_by_email
from app.modules.auth.models import User
from app.modules.auth.security import hash_password
from app.modules.templates.dao import get_template
from app.modules.templates.models import Template

BUILTIN_TEMPLATES: list[dict[str, object]] = [
    {
        "id": "tpl_classic",
        "name": "经典单栏",
        "status": "published",
        "revision": 1,
        "publisher": "system",
        "published_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "validation_errors": [],
    },
    {
        "id": "tpl_modern",
        "name": "现代双栏",
        "status": "published",
        "revision": 1,
        "publisher": "system",
        "published_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "validation_errors": [],
    },
]


def seed_templates(db: Session) -> int:
    """Insert missing built-in templates; safe to run repeatedly."""
    created = 0
    for data in BUILTIN_TEMPLATES:
        if get_template(db, str(data["id"])) is None:
            db.add(Template(**data))
            created += 1
    db.commit()
    return created


def seed_admin(db: Session) -> bool:
    """Create the bootstrap admin once; returns True when it was created."""
    settings = get_settings()
    email = settings.bootstrap_admin_email.strip().lower()
    if get_user_by_email(db, email) is not None:
        return False
    now = datetime.now(timezone.utc)
    db.add(
        User(
            id="user_admin",
            email=email,
            display_name=settings.bootstrap_admin_name,
            password_hash=hash_password(settings.bootstrap_admin_password),
            role="admin",
            is_banned=False,
            created_at=now,
            updated_at=now,
        )
    )
    db.commit()
    return True


def main() -> None:
    with SessionLocal() as session:
        templates_created = seed_templates(session)
        admin_created = seed_admin(session)
    print(f"seeded {templates_created} template(s); bootstrap admin created={admin_created}")


if __name__ == "__main__":
    main()
