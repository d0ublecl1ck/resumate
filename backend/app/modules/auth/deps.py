import redis
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import CurrentUser
from app.core.redis import get_redis
from app.shared.errors import AccountBanned, Forbidden, Unauthenticated

from . import dao, session_store


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    client: redis.Redis = Depends(get_redis),
) -> CurrentUser:
    """Resolve the HttpOnly session cookie against Redis and load the owner."""
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
    return CurrentUser(id=user.id, display_name=user.display_name, role=user.role)


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise Forbidden("需要管理员权限")
    return user
