import re
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

import redis
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.shared.errors import (
    AccountBanned,
    EmailAlreadyRegistered,
    EmailNotVerified,
    Forbidden,
    InvalidCredentials,
    RateLimited,
    ResourceNotFound,
    ResendTooSoon,
    ValidationFailed,
    VerificationTokenInvalid,
)

from . import dao, session_store, verification_store
from .models import Permission, Role, User
from .rbac import BOOTSTRAP_ROLE_CODE, DEFAULT_ROLE_CODE, ROLE_CODE_PATTERN, ROLE_RANK
from .schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResendVerificationRequest,
    RoleCreate,
    RoleUpdate,
    VerifyEmailRequest,
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


@dataclass(frozen=True)
class PendingVerification:
    """Who to mail and which link to send.

    ``link`` is None when a resend has nothing to do (unknown or already
    verified address); the HTTP response stays neutral in that case.
    """

    email: str
    link: str | None


def _verification_link(token: str) -> str:
    return f"{get_settings().public_web_base_url.rstrip('/')}/verify-email?token={token}"


def _issue_verification_mail(client: redis.Redis, user: User) -> PendingVerification:
    settings = get_settings()
    if verification_store.in_resend_cooldown(client, user.email):
        raise ResendTooSoon("验证邮件刚刚发送，请稍后再试")
    if not verification_store.is_within_send_quota(
        client,
        user.email,
        limit=settings.email_verification_max_sends_per_hour,
    ):
        raise RateLimited("验证邮件发送过于频繁，请稍后再试")
    token = verification_store.issue_verification(
        client,
        user.id,
        ttl_seconds=settings.email_verification_token_ttl_seconds,
    )
    verification_store.start_resend_cooldown(
        client,
        user.email,
        seconds=settings.email_verification_resend_cooldown_seconds,
    )
    return PendingVerification(user.email, _verification_link(token))


def register(db: Session, client: redis.Redis, payload: RegisterRequest) -> PendingVerification:
    """Create an unverified account and issue a verification link, never a session."""
    email = payload.email.strip().lower()
    user = dao.get_user_by_email(db, email)
    if user is not None and user.email_verified_at is not None:
        raise EmailAlreadyRegistered("该邮箱已注册")
    if user is None:
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
            email_verified_at=None,
            created_at=now,
            updated_at=now,
        )
        dao.add_user(db, user)
        db.flush()
        _assign_role(db, user.id, default_role)
        db.commit()
        db.refresh(user)
    return _issue_verification_mail(client, user)


def resend_verification(
    db: Session,
    client: redis.Redis,
    payload: ResendVerificationRequest,
) -> PendingVerification:
    email = payload.email.strip().lower()
    user = dao.get_user_by_email(db, email)
    if user is None or user.email_verified_at is not None:
        return PendingVerification(email, None)
    return _issue_verification_mail(client, user)


def verify_email(db: Session, client: redis.Redis, payload: VerifyEmailRequest) -> tuple[User, str]:
    """Consume the one-time token, mark the mailbox verified, and start a session."""
    user_id = verification_store.consume_verification(client, payload.token)
    user = dao.get_user(db, user_id) if user_id is not None else None
    if user is None:
        raise VerificationTokenInvalid("验证链接无效或已过期，请重新获取")
    if user.email_verified_at is None:
        now = _now()
        user.email_verified_at = now
        user.updated_at = now
        db.commit()
        db.refresh(user)
    return user, _issue_session(client, user.id)


def login(db: Session, client: redis.Redis, payload: LoginRequest) -> tuple[User, str]:
    user = dao.get_user_by_email(db, payload.email.strip().lower())
    if user is None or not verify_password(payload.password, user.password_hash):
        raise InvalidCredentials("邮箱或密码不正确")
    if user.is_banned:
        raise AccountBanned("账号已被封禁，请联系管理员")
    if user.email_verified_at is None:
        raise EmailNotVerified("邮箱尚未验证，请先完成邮箱验证")
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


def get_user_or_raise(db: Session, user_id: str) -> User:
    user = dao.get_user(db, user_id)
    if user is None:
        raise ResourceNotFound(f"用户 {user_id} 不存在")
    return user
