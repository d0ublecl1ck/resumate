from collections.abc import Callable

import redis
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import CurrentUser
from app.core.redis import get_redis
from app.shared.errors import AccountBanned, Forbidden, Unauthenticated

from . import dao, session_store
from .rbac import PERMISSION_CODES


def _resolve_access(db: Session, user_id: str) -> tuple[tuple[str, ...], frozenset[str], str]:
    """Project user_roles / role_permissions into codes for one request."""
    roles = dao.list_user_roles(db, user_id)
    if not roles:
        # Fail closed: an account without any role keeps no permissions.
        return ("user",), frozenset(), "user"
    primary = max(roles, key=lambda role: role.rank)
    permissions = frozenset(dao.list_user_permission_codes(db, user_id))
    return tuple(role.code for role in roles), permissions, primary.code


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    client: redis.Redis = Depends(get_redis),
) -> CurrentUser:
    """Resolve the HttpOnly session cookie, then the account's RBAC projection."""
    token = request.cookies.get(get_settings().session_cookie_name)
    if not token:
        raise Unauthenticated("未登录")
    user_id = session_store.get_session_user_id(client, token)
    if user_id is None:
        raise Unauthenticated("登录已失效，请重新登录")
    user = dao.get_user(db, user_id)
    if user is None:
        session_store.revoke_session(client, token)
        raise Unauthenticated("登录已失效，请重新登录")
    if user.is_banned:
        session_store.revoke_all_sessions(client, user.id)
        raise AccountBanned("账号已被封禁，请联系管理员")
    roles, permissions, primary = _resolve_access(db, user.id)
    return CurrentUser(
        id=user.id,
        display_name=user.display_name,
        role=primary,
        roles=roles,
        permissions=permissions,
    )


def require_permission(code: str) -> Callable[..., CurrentUser]:
    """Dependency factory: the caller must own this permission code.

    The code is validated against the catalogue at import time so a typo fails
    fast, and is stamped on the dependency for the endpoint coverage guard.
    """
    if code not in PERMISSION_CODES:
        raise RuntimeError(f"未知权限码：{code}")

    def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if code not in user.permissions:
            raise Forbidden("当前账号没有该操作权限")
        return user

    dependency.__required_permission__ = code  # type: ignore[attr-defined]
    dependency.__name__ = "require_" + code.replace(":", "_")
    return dependency
