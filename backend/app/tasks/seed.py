"""Seed built-in reference data.

Run with: uv run python -m app.tasks.seed
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
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


def main() -> None:
    with SessionLocal() as session:
        created = seed_templates(session)
    print(f"seeded {created} template(s)")


if __name__ == "__main__":
    main()
