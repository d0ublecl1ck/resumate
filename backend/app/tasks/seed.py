"""Seed built-in reference data: templates, the RBAC catalogue and the bootstrap admin.

Run with: uv run python -m app.tasks.seed
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.modules.auth import dao
from app.modules.auth.models import Permission, Role, RolePermission, User
from app.modules.auth.rbac import BOOTSTRAP_ROLE_CODE, PERMISSIONS, ROLES, role_permissions
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


def _now() -> datetime:
    return datetime.now(timezone.utc)


def seed_templates(db: Session) -> int:
    """Insert missing built-in templates; safe to run repeatedly."""
    created = 0
    for data in BUILTIN_TEMPLATES:
        if get_template(db, str(data["id"])) is None:
            db.add(Template(**data))
            created += 1
    db.commit()
    return created


def seed_rbac(db: Session) -> int:
    """Upsert roles, permissions and their links; returns newly created rows."""
    now = _now()
    created = 0
    roles: dict[str, Role] = {}
    for spec in ROLES:
        role = dao.get_role_by_code(db, spec.code)
        if role is None:
            role = Role(
                id="role_" + spec.code,
                code=spec.code,
                name=spec.name,
                description=spec.description,
                rank=spec.rank,
                is_system=True,
                created_at=now,
                updated_at=now,
            )
            dao.add_role(db, role)
            created += 1
        else:
            role.name = spec.name
            role.description = spec.description
            role.rank = spec.rank
            role.is_system = True
        roles[spec.code] = role
    db.flush()

    permissions: dict[str, Permission] = {}
    for spec in PERMISSIONS:
        permission = db.scalar(select(Permission).where(Permission.code == spec.code))
        if permission is None:
            permission = Permission(
                id="perm_" + spec.code.replace(":", "_"),
                code=spec.code,
                group=spec.group,
                name=spec.name,
                created_at=now,
            )
            dao.add_permission(db, permission)
            created += 1
        else:
            permission.group = spec.group
            permission.name = spec.name
        permissions[spec.code] = permission
    db.flush()

    # The permission table mirrors the code catalogue exactly: prune any row that
    # is no longer declared in rbac.py (permissions are code-owned, not user data).
    catalogue = {spec.code for spec in PERMISSIONS}
    for permission in dao.list_permissions(db):
        if permission.code not in catalogue:
            dao.remove_permission_links(db, permission.id)
            dao.delete_permission(db, permission)

    # System roles are owned by rbac.py: reconcile their links exactly so an
    # out-of-band edit cannot silently widen a built-in role.
    for spec in ROLES:
        role = roles[spec.code]
        desired = {permissions[code].id for code in role_permissions(spec.code)}
        current = set(dao.list_role_permission_ids(db, role.id))
        for permission_id in desired - current:
            dao.add_role_permission(db, role.id, permission_id)
        for permission_id in current - desired:
            dao.remove_role_permission(db, role.id, permission_id)
    db.commit()
    return created


def seed_admin(db: Session) -> bool:
    """Create the bootstrap super admin once, promoting it if it already exists."""
    seed_rbac(db)
    settings = get_settings()
    email = settings.bootstrap_admin_email.strip().lower()
    role = dao.get_role_by_code(db, BOOTSTRAP_ROLE_CODE)
    if role is None:
        raise RuntimeError("缺少内置角色 super_admin，请先运行 seed_rbac")
    existing = dao.get_user_by_email(db, email)
    if existing is not None:
        current = {item.code for item in dao.list_user_roles(db, existing.id)}
        if BOOTSTRAP_ROLE_CODE not in current:
            dao.clear_user_roles(db, existing.id)
            dao.add_user_role(db, existing.id, role.id)
            db.commit()
        return False
    now = _now()
    user = User(
        id="user_admin",
        email=email,
        display_name=settings.bootstrap_admin_name,
        password_hash=hash_password(settings.bootstrap_admin_password),
        is_banned=False,
        email_verified_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(user)
    db.flush()
    dao.add_user_role(db, user.id, role.id)
    db.commit()
    return True


def main() -> None:
    with SessionLocal() as session:
        templates_created = seed_templates(session)
        rbac_created = seed_rbac(session)
        admin_created = seed_admin(session)
    print(f"seeded {templates_created} template(s), {rbac_created} rbac row(s); bootstrap admin created={admin_created}")


if __name__ == "__main__":
    main()
