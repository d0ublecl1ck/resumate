from datetime import datetime, timezone
from uuid import uuid4

import redis
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.shared.errors import AccountBanned, EmailAlreadyRegistered, InvalidCredentials, ResourceNotFound, ValidationFailed

from . import dao, session_store
from .models import User
from .schemas import ChangePasswordRequest, LoginRequest, RegisterRequest
from .security import hash_password, verify_password


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return f"user_{uuid4().hex[:12]}"


def _issue_session(client: redis.Redis, user_id: str) -> str:
    return session_store.issue_session(client, user_id, ttl_seconds=get_settings().session_ttl_seconds)


def register(db: Session, client: redis.Redis, payload: RegisterRequest) -> tuple[User, str]:
    email = payload.email.strip().lower()
    if dao.get_user_by_email(db, email) is not None:
        raise EmailAlreadyRegistered("该邮箱已注册")
    now = _now()
    user = User(
        id=_new_id(),
        email=email,
        display_name=payload.display_name.strip(),
        password_hash=hash_password(payload.password),
        role="user",
        is_banned=False,
        created_at=now,
        updated_at=now,
    )
    dao.add_user(db, user)
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


def ban_user(db: Session, client: redis.Redis, actor_id: str, user_id: str, reason: str | None) -> User:
    if user_id == actor_id:
        raise ValidationFailed("不能封禁自己的账号")
    user = get_user_or_raise(db, user_id)
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


def get_user_or_raise(db: Session, user_id: str) -> User:
    user = dao.get_user(db, user_id)
    if user is None:
        raise ResourceNotFound(f"用户 {user_id} 不存在")
    return user
