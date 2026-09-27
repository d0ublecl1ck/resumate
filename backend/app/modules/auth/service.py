from datetime import datetime, timezone
from uuid import uuid4

import redis
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.shared.errors import AccountBanned, EmailAlreadyRegistered, InvalidCredentials, ResourceNotFound

from . import dao, session_store
from .models import User
from .schemas import LoginRequest, RegisterRequest
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


def get_user_or_raise(db: Session, user_id: str) -> User:
    user = dao.get_user(db, user_id)
    if user is None:
        raise ResourceNotFound(f"用户 {user_id} 不存在")
    return user
