import re
from datetime import datetime, timezone
from uuid import uuid4

import redis
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.shared.errors import (
    AccountBanned,
    EmailAlreadyRegistered,
    Forbidden,
    InvalidCredentials,
    ResourceNotFound,
    ValidationFailed,
)

from . import dao, session_store
from .models import Permission, Role, User
from .rbac import (
    BOOTSTRAP_ROLE_CODE,
    DEFAULT_ROLE_CODE,
    PERMISSION_CODE_PATTERN,
    ROLE_CODE_PATTERN,
    ROLE_RANK,
)
from .schemas import (
    ChangePasswordRequest,
    LoginRequest,
    PermissionCreate,
    PermissionUpdate,
    RegisterRequest,
    RoleCreate,
    RoleUpdate,
)
from .security import hash_password, verify_password


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return f"user_{uuid4().hex[:12]}"


def _issue_session(client: redis.Redis, user_id: str) -> str:
    return session_store.issue_session(client, user_id, ttl_seconds=get_settings().session_ttl_seconds)


def _max_rank_codes(codes: tuple[str, ...]) -> int:
    return max((ROLE_RANK.get(code, 0) for code in codes), default=0)


def _assign_role(db: Session, user_id: str, role: Role) -> None:
    dao.clear_user_roles(db, user_id)
    dao.add_user_role(db, user_id, role.id)


def _require_actor_outranks(db: Session, actor: CurrentUser, target_id: str, action: str) -> User:
    target = get_user_or_raise(db, target_id)
    target_rank = max((role.rank for role in dao.list_user_roles(db, target_id)), default=0)
    actor_rank = _max_rank_codes(actor.roles)
    if actor_rank <= target_rank:
        raise Forbidden(f"不能{action}同级或更高权限的账号")
    return target


def register(db: Session, client: redis.Redis, payload: RegisterRequest) -> tuple[User, str]:
    email = payload.email.strip().lower()
    if dao.get_user_by_email(db, email) is not None:
        raise EmailAlreadyRegistered("该邮箱已注册")
    default_role = dao.get_role_by_code(db, DEFAULT_ROLE_CODE)
    if default_role is None:
        raise RuntimeError("缺少内置角色 user，请先运行 app.tasks.seed")
    now = _now()
    user = User(
        id=_new_id(),
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        is_banned=False,
        created_at=now,
        updated_at=now,
    )
    dao.add_user(db, user)
    db.flush()
    _assign_role(db, user.id, default_role)
    db.commit()
    db.refresh(user)
    return user, _issue_session(client, user.id)


def login(db: Session, client: redis.Redis, payload: LoginRequest) -> tuple[User, str]:
    user = dao.get_user_by_email(db, payload.email.strip().lower())
    if user is None or not verify_password(payload.password, user.password_hash):
        raise InvalidCredentials("邮箱或密码不正确")
    if user.is_banned:
        raise AccountBanned("账号已被封禁，请联系管理员")
    return user, _issue_session(client, user.id)


def logout(client: redis.Redis, token: str | None) -> None:
    if token:
        session_store.revoke_session(client, token)


def change_password(db: Session, client: redis.Redis, user_id: str, payload: ChangePasswordRequest) -> None:
    user = get_user_or_raise(db, user_id)
    if not verify_password(payload.current_password, user.password_hash):
        raise InvalidCredentials("当前密码不正确")
    if verify_password(payload.new_password, user.password_hash):
        raise ValidationFailed("新密码不能与当前密码相同")
    user.password_hash = hash_password(payload.new_password)
    user.updated_at = _now()
    db.commit()
    # Changing the credential must invalidate every session issued under the old one.
    session_store.revoke_all_sessions(client, user.id)


def list_users(db: Session) -> list[User]:
    return dao.list_users(db)


def list_roles(db: Session) -> list[Role]:
    return dao.list_roles(db)


def list_permissions(db: Session) -> list[Permission]:
    return dao.list_permissions(db)


def ban_user(
    db: Session,
    client: redis.Redis,
    actor: CurrentUser,
    user_id: str,
    reason: str | None,
) -> User:
    if user_id == actor.id:
        raise ValidationFailed("不能封禁自己的账号")
    user = _require_actor_outranks(db, actor, user_id, "封禁")
    if not user.is_banned:
        now = _now()
        user.is_banned = True
        user.banned_at = now
        user.banned_reason = reason
        user.updated_at = now
        db.commit()
    session_store.revoke_all_sessions(client, user.id)
    db.refresh(user)
    return user


def unban_user(db: Session, actor: CurrentUser, user_id: str) -> User:
    user = _require_actor_outranks(db, actor, user_id, "解封")
    if user.is_banned:
        user.is_banned = False
        user.banned_at = None
        user.banned_reason = None
        user.updated_at = _now()
        db.commit()
        db.refresh(user)
    return user


def change_role(db: Session, actor: CurrentUser, user_id: str, role_code: str) -> User:
    if user_id == actor.id:
        raise ValidationFailed("不能修改自己的角色")
    role = dao.get_role_by_code(db, role_code)
    if role is None:
        raise ValidationFailed(f"角色 {role_code} 不存在")
    user = get_user_or_raise(db, user_id)
    current = {item.code for item in dao.list_user_roles(db, user_id)}
    if BOOTSTRAP_ROLE_CODE in current and role_code != BOOTSTRAP_ROLE_CODE:
        if dao.count_users_with_role(db, BOOTSTRAP_ROLE_CODE) <= 1:
            raise ValidationFailed("必须保留至少一个超级管理员")
    if current == {role_code}:
        return user
    _assign_role(db, user.id, role)
    user.updated_at = _now()
    db.commit()
    db.refresh(user)
    return user


def _get_role_or_raise(db: Session, role_id: str) -> Role:
    role = dao.get_role(db, role_id)
    if role is None:
        raise ResourceNotFound(f"角色 {role_id} 不存在")
    return role


def _get_permission_or_raise(db: Session, permission_id: str) -> Permission:
    permission = dao.get_permission(db, permission_id)
    if permission is None:
        raise ResourceNotFound(f"权限 {permission_id} 不存在")
    return permission


def _resolve_permissions(db: Session, codes: list[str]) -> list[Permission]:
    resolved: list[Permission] = []
    seen: set[str] = set()
    for code in codes:
        if code in seen:
            continue
        seen.add(code)
        permission = dao.get_permission_by_code(db, code)
        if permission is None:
            raise ValidationFailed(f"权限 {code} 不存在")
        resolved.append(permission)
    return resolved


def create_role(db: Session, payload: RoleCreate) -> Role:
    code = payload.code.strip()
    if not re.match(ROLE_CODE_PATTERN, code):
        raise ValidationFailed("角色 code 只能由小写字母、数字与下划线组成")
    if dao.get_role_by_code(db, code) is not None:
        raise ValidationFailed(f"角色 code {code} 已存在")
    permissions = _resolve_permissions(db, payload.permissions)
    now = _now()
    role = Role(
        id=f"role_{code}_{uuid4().hex[:6]}",
        code=code,
        name=payload.name.strip(),
        description=payload.description.strip(),
        rank=0,
        is_system=False,
        created_at=now,
        updated_at=now,
    )
    dao.add_role(db, role)
    db.flush()
    for permission in permissions:
        dao.add_role_permission(db, role.id, permission.id)
    db.commit()
    db.refresh(role)
    return role


def update_role(db: Session, role_id: str, payload: RoleUpdate) -> Role:
    role = _get_role_or_raise(db, role_id)
    if role.is_system:
        raise ValidationFailed("系统角色不可修改")
    if payload.name is not None:
        role.name = payload.name.strip()
    if payload.description is not None:
        role.description = payload.description.strip()
    if payload.permissions is not None:
        permissions = _resolve_permissions(db, payload.permissions)
        dao.clear_role_permissions(db, role.id)
        for permission in permissions:
            dao.add_role_permission(db, role.id, permission.id)
    role.updated_at = _now()
    db.commit()
    db.refresh(role)
    return role


def delete_role(db: Session, role_id: str) -> None:
    role = _get_role_or_raise(db, role_id)
    if role.is_system:
        raise ValidationFailed("系统角色不可删除")
    if dao.count_role_users(db, role.id) > 0:
        raise ValidationFailed("仍有用户使用该角色，不能删除")
    dao.clear_role_permissions(db, role.id)
    dao.delete_role(db, role)
    db.commit()


def create_permission(db: Session, payload: PermissionCreate) -> Permission:
    code = payload.code.strip()
    if not re.match(PERMISSION_CODE_PATTERN, code):
        raise ValidationFailed("权限 code 需形如 resource:action（小写字母、数字、下划线）")
    if dao.get_permission_by_code(db, code) is not None:
        raise ValidationFailed(f"权限 code {code} 已存在")
    permission = Permission(
        id=f"perm_{code.replace(':', '_')}_{uuid4().hex[:4]}",
        code=code,
        group=payload.group.strip(),
        name=payload.name.strip(),
        is_system=False,
        created_at=_now(),
    )
    dao.add_permission(db, permission)
    db.commit()
    db.refresh(permission)
    return permission


def update_permission(db: Session, permission_id: str, payload: PermissionUpdate) -> Permission:
    permission = _get_permission_or_raise(db, permission_id)
    if permission.is_system:
        raise ValidationFailed("系统权限不可修改")
    if payload.name is not None:
        permission.name = payload.name.strip()
    if payload.group is not None:
        permission.group = payload.group.strip()
    db.commit()
    db.refresh(permission)
    return permission


def delete_permission(db: Session, permission_id: str) -> None:
    permission = _get_permission_or_raise(db, permission_id)
    if permission.is_system:
        raise ValidationFailed("系统权限不可删除")
    dao.remove_permission_links(db, permission.id)
    dao.delete_permission(db, permission)
    db.commit()


def get_user_or_raise(db: Session, user_id: str) -> User:
    user = dao.get_user(db, user_id)
    if user is None:
        raise ResourceNotFound(f"用户 {user_id} 不存在")
    return user
