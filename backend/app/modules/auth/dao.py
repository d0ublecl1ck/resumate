from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .models import Permission, Role, RolePermission, User, UserRole


def get_user(db: Session, user_id: str) -> User | None:
    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def add_user(db: Session, user: User) -> None:
    db.add(user)


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at)))


def get_role(db: Session, role_id: str) -> Role | None:
    return db.get(Role, role_id)


def get_role_by_code(db: Session, code: str) -> Role | None:
    return db.scalar(select(Role).where(Role.code == code))


def list_roles(db: Session) -> list[Role]:
    return list(db.scalars(select(Role).order_by(Role.rank.desc())))


def add_role(db: Session, role: Role) -> None:
    db.add(role)


def list_permissions(db: Session) -> list[Permission]:
    return list(db.scalars(select(Permission).order_by(Permission.group, Permission.code)))


def add_permission(db: Session, permission: Permission) -> None:
    db.add(permission)


def add_user_role(db: Session, user_id: str, role_id: str) -> None:
    db.add(UserRole(user_id=user_id, role_id=role_id))


def clear_user_roles(db: Session, user_id: str) -> None:
    db.execute(delete(UserRole).where(UserRole.user_id == user_id))


def add_role_permission(db: Session, role_id: str, permission_id: str) -> None:
    db.add(RolePermission(role_id=role_id, permission_id=permission_id))


def list_user_roles(db: Session, user_id: str) -> list[Role]:
    statement = (
        select(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
        .order_by(Role.rank.desc())
    )
    return list(db.scalars(statement))


def list_user_permission_codes(db: Session, user_id: str) -> list[str]:
    statement = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(UserRole, UserRole.role_id == RolePermission.role_id)
        .where(UserRole.user_id == user_id)
        .distinct()
    )
    return list(db.scalars(statement))


def list_role_permission_codes(db: Session, role_id: str) -> list[str]:
    statement = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.role_id == role_id)
        .order_by(Permission.code)
    )
    return list(db.scalars(statement))


def get_permission(db: Session, permission_id: str) -> Permission | None:
    return db.get(Permission, permission_id)


def get_permission_by_code(db: Session, code: str) -> Permission | None:
    return db.scalar(select(Permission).where(Permission.code == code))


def list_permission_codes(db: Session) -> list[str]:
    return list(db.scalars(select(Permission.code)))


def list_role_permission_ids(db: Session, role_id: str) -> list[str]:
    statement = select(RolePermission.permission_id).where(RolePermission.role_id == role_id)
    return list(db.scalars(statement))


def clear_role_permissions(db: Session, role_id: str) -> None:
    db.execute(delete(RolePermission).where(RolePermission.role_id == role_id))


def remove_role_permission(db: Session, role_id: str, permission_id: str) -> None:
    db.execute(
        delete(RolePermission).where(
            RolePermission.role_id == role_id,
            RolePermission.permission_id == permission_id,
        )
    )


def remove_permission_links(db: Session, permission_id: str) -> None:
    db.execute(delete(RolePermission).where(RolePermission.permission_id == permission_id))


def delete_role(db: Session, role: Role) -> None:
    db.delete(role)


def delete_permission(db: Session, permission: Permission) -> None:
    db.delete(permission)


def count_role_users(db: Session, role_id: str) -> int:
    statement = select(func.count()).select_from(UserRole).where(UserRole.role_id == role_id)
    return int(db.scalar(statement) or 0)


def count_users_with_role(db: Session, role_code: str) -> int:
    statement = (
        select(func.count())
        .select_from(UserRole)
        .join(Role, Role.id == UserRole.role_id)
        .where(Role.code == role_code)
    )
    return int(db.scalar(statement) or 0)
