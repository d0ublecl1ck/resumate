import hashlib
from collections.abc import Callable
from datetime import datetime, timezone

import redis
from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import CurrentUser
from app.core.redis import get_redis
from app.shared.errors import (
    AccountBanned,
    ErrorCode,
    Forbidden,
    ScopeInsufficient,
    TokenRevoked,
    Unauthenticated,
)

from . import dao, session_store
from .rbac import PERMISSION_CODES

PAT_AUTH_PURPOSE = "pat_auth"
PAT_SCOPE_PURPOSE = "pat_scope"
PAT_HUMAN_SESSION_PURPOSE = "pat_human_session"
RUN_TOKEN_AUTH_PURPOSE = "run_token_auth"
RUN_TOKEN_SCOPE_PURPOSE = "run_token_scope"
RUN_HUMAN_SESSION_PURPOSE = "run_human_session"
_UNKNOWN_OWNER = "unknown"
_UNKNOWN_CLIENT = "unknown"


def _resolve_access(db: Session, user_id: str) -> tuple[tuple[str, ...], frozenset[str], str]:
    """Project user_roles / role_permissions into codes for one request."""
    roles = dao.list_user_roles(db, user_id)
    if not roles:
        # Fail closed: an account without any role keeps no permissions.
        return ("user",), frozenset(), "user"
    primary = max(roles, key=lambda role: role.rank)
    permissions = frozenset(dao.list_user_permission_codes(db, user_id))
    return tuple(role.code for role in roles), permissions, primary.code


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_expired(expires_at: datetime) -> bool:
    """Treat a naive stored expiry as UTC so SQLite-backed tests behave too."""
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= _utcnow()


def _record_auth_log(
    db: Session,
    *,
    owner_id: str,
    client_id: str,
    scope: str,
    resource: str,
    purpose: str,
    result: str,
    error_code: ErrorCode | None = None,
) -> None:
    """Write one credential audit row and commit it before the request settles."""
    from app.modules.access import dao as access_dao

    access_dao.record_access_log(
        db,
        owner_id=owner_id,
        client_id=client_id,
        scope=scope,
        resource=resource,
        purpose=purpose,
        result=result,
        error_code=error_code.value if error_code is not None else None,
    )
    db.commit()


def _authenticate_pat(request: Request, db: Session, secret: str) -> CurrentUser:
    """Resolve an Authorization: Bearer PAT, auditing every rejection as denied."""
    from app.modules.access.dao import get_token_by_hash
    from app.modules.access.service import TOKEN_PREFIX

    resource = request.url.path
    if not secret.startswith(TOKEN_PREFIX):
        _record_auth_log(
            db,
            owner_id=_UNKNOWN_OWNER,
            client_id=_UNKNOWN_CLIENT,
            scope="",
            resource=resource,
            purpose=PAT_AUTH_PURPOSE,
            result="denied",
            error_code=ErrorCode.UNAUTHENTICATED,
        )
        raise Unauthenticated("访问令牌无效")

    token = get_token_by_hash(db, hashlib.sha256(secret.encode("utf-8")).hexdigest())
    if token is None:
        _record_auth_log(
            db,
            owner_id=_UNKNOWN_OWNER,
            client_id=_UNKNOWN_CLIENT,
            scope="",
            resource=resource,
            purpose=PAT_AUTH_PURPOSE,
            result="denied",
            error_code=ErrorCode.UNAUTHENTICATED,
        )
        raise Unauthenticated("访问令牌无效")

    scopes = frozenset(token.scopes or [])
    scope_label = ",".join(sorted(scopes))
    if token.revoked_at is not None:
        _record_auth_log(
            db,
            owner_id=token.owner_id,
            client_id=token.name,
            scope=scope_label,
            resource=resource,
            purpose=PAT_AUTH_PURPOSE,
            result="denied",
            error_code=ErrorCode.TOKEN_REVOKED,
        )
        raise TokenRevoked("访问令牌已撤销")
    if _is_expired(token.expires_at):
        _record_auth_log(
            db,
            owner_id=token.owner_id,
            client_id=token.name,
            scope=scope_label,
            resource=resource,
            purpose=PAT_AUTH_PURPOSE,
            result="denied",
            error_code=ErrorCode.UNAUTHENTICATED,
        )
        raise Unauthenticated("访问令牌已过期")

    user = dao.get_user(db, token.owner_id)
    if user is None:
        _record_auth_log(
            db,
            owner_id=token.owner_id,
            client_id=token.name,
            scope=scope_label,
            resource=resource,
            purpose=PAT_AUTH_PURPOSE,
            result="denied",
            error_code=ErrorCode.UNAUTHENTICATED,
        )
        raise Unauthenticated("访问令牌无效")
    if user.is_banned:
        _record_auth_log(
            db,
            owner_id=token.owner_id,
            client_id=token.name,
            scope=scope_label,
            resource=resource,
            purpose=PAT_AUTH_PURPOSE,
            result="denied",
            error_code=ErrorCode.ACCOUNT_BANNED,
        )
        raise AccountBanned("账号已被封禁，请联系管理员")

    roles, permissions, primary = _resolve_access(db, user.id)
    token.last_used_at = _utcnow()
    _record_auth_log(
        db,
        owner_id=user.id,
        client_id=token.name,
        scope=scope_label,
        resource=resource,
        purpose=PAT_AUTH_PURPOSE,
        result="allowed",
    )
    return CurrentUser(
        id=user.id,
        display_name=user.display_name,
        role=primary,
        roles=roles,
        permissions=permissions,
        auth_kind="pat",
        pat_id=token.id,
        scopes=scopes,
        client_id=token.name or token.id,
    )


def _run_token_scope_denied(db: Session, credential, *, resource: str, error_code: ErrorCode) -> None:
    """Audit one scope refusal for an otherwise valid run credential."""
    _record_auth_log(
        db,
        owner_id=credential.owner_id,
        client_id=credential.run_id or _UNKNOWN_CLIENT,
        scope="",
        resource=resource,
        purpose=RUN_TOKEN_SCOPE_PURPOSE,
        result="denied",
        error_code=error_code,
    )


def _enforce_run_scope(request: Request, credential, db: Session) -> None:
    """Refuse a valid run credential that reaches past its own run.

    Approval decisions are deliberately left to require_human_session, so their
    denial carries the human-session purpose; every other path must match the
    run allowlist and target the credential's own resume.
    """
    from app.modules.agent import run_token

    path = request.url.path
    if run_token.is_human_only_path(path):
        return
    if not run_token.endpoint_allowed(request.method, path):
        _run_token_scope_denied(db, credential, resource=path, error_code=ErrorCode.FORBIDDEN)
        raise Forbidden("运行凭据不能访问该端点")

    target = run_token.path_resume_id(path)
    if target is None:
        turn_id = run_token.path_turn_id(path)
        if turn_id is not None:
            from app.modules.agent import dao as agent_dao

            turn = agent_dao.get_turn(db, turn_id)
            target = turn.resume_id if turn is not None else None
    if target is not None and target != credential.resume_id:
        _run_token_scope_denied(db, credential, resource=path, error_code=ErrorCode.FORBIDDEN)
        raise Forbidden("运行凭据只能访问它所属的简历")


def _authenticate_run_token(
    request: Request,
    db: Session,
    client: redis.Redis,
    secret: str,
) -> CurrentUser:
    """Resolve an Authorization: Bearer run credential (issue 8f5fe)."""
    from app.modules.agent import run_token

    resource = request.url.path
    credential = run_token.lookup_run_token(client, secret)
    if credential is None:
        _record_auth_log(
            db,
            owner_id=_UNKNOWN_OWNER,
            client_id=_UNKNOWN_CLIENT,
            scope="",
            resource=resource,
            purpose=RUN_TOKEN_AUTH_PURPOSE,
            result="denied",
            error_code=ErrorCode.UNAUTHENTICATED,
        )
        raise Unauthenticated("运行凭据无效或已过期")
    if _is_expired(credential.expires_at):
        _record_auth_log(
            db,
            owner_id=credential.owner_id,
            client_id=credential.run_id or _UNKNOWN_CLIENT,
            scope="",
            resource=resource,
            purpose=RUN_TOKEN_AUTH_PURPOSE,
            result="denied",
            error_code=ErrorCode.UNAUTHENTICATED,
        )
        raise Unauthenticated("运行凭据已过期")
    if run_token.register_use(client, secret) > credential.max_uses:
        # Exhaustion retires the credential at once; later calls look unknown.
        run_token.revoke_run_token(client, secret)
        _record_auth_log(
            db,
            owner_id=credential.owner_id,
            client_id=credential.run_id or _UNKNOWN_CLIENT,
            scope="",
            resource=resource,
            purpose=RUN_TOKEN_AUTH_PURPOSE,
            result="denied",
            error_code=ErrorCode.FORBIDDEN,
        )
        raise Forbidden("运行凭据已用完")

    user = dao.get_user(db, credential.owner_id)
    if user is None or user.is_banned:
        _record_auth_log(
            db,
            owner_id=credential.owner_id,
            client_id=credential.run_id or _UNKNOWN_CLIENT,
            scope="",
            resource=resource,
            purpose=RUN_TOKEN_AUTH_PURPOSE,
            result="denied",
            error_code=ErrorCode.ACCOUNT_BANNED if user is not None else ErrorCode.UNAUTHENTICATED,
        )
        if user is not None:
            raise AccountBanned("账号已被封禁，请联系管理员")
        raise Unauthenticated("运行凭据无效或已过期")

    roles, permissions, primary = _resolve_access(db, user.id)
    principal = CurrentUser(
        id=user.id,
        display_name=user.display_name,
        role=primary,
        roles=roles,
        permissions=permissions,
        auth_kind="run",
        run_id=credential.run_id or None,
        client_id=credential.run_id or None,
    )
    _enforce_run_scope(request, credential, db)
    return principal


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    client: redis.Redis = Depends(get_redis),
) -> CurrentUser:
    """Resolve a Bearer PAT first, then the HttpOnly session cookie."""
    authorization = request.headers.get("authorization")
    if authorization and authorization.lower().startswith("bearer "):
        secret = authorization[len("Bearer ") :].strip()
        from app.modules.agent import run_token

        if secret.startswith(run_token.RUN_TOKEN_PREFIX):
            return _authenticate_run_token(request, db, client, secret)
        return _authenticate_pat(request, db, secret)

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

    def dependency(
        request: Request,
        user: CurrentUser = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> CurrentUser:
        if code not in user.permissions:
            raise Forbidden("当前账号没有该操作权限")
        if user.auth_kind == "pat" and code not in user.scopes:
            _record_auth_log(
                db,
                owner_id=user.id,
                client_id=user.pat_id or _UNKNOWN_CLIENT,
                scope=code,
                resource=request.url.path,
                purpose=PAT_SCOPE_PURPOSE,
                result="denied",
                error_code=ErrorCode.SCOPE_INSUFFICIENT,
            )
            raise ScopeInsufficient("访问令牌缺少该操作所需的 scope")
        return user

    dependency.__required_permission__ = code  # type: ignore[attr-defined]
    dependency.__name__ = "require_" + code.replace(":", "_")
    return dependency


def require_human_session(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentUser:
    """Dependency: only a browser (cookie) session may pass.

    Approval and rejection are human actions that close the confirmation loop.
    A PAT is a delegated, long-lived credential an Agent can hold, so a PAT
    caller must never decide its own pending action. The request is denied and
    audited instead of being silently accepted.
    """
    if user.auth_kind != "session":
        # PAT keeps its original purpose; a run credential gets its own so the
        # two delegated credential kinds stay distinguishable in the audit trail.
        purpose = PAT_HUMAN_SESSION_PURPOSE if user.auth_kind == "pat" else RUN_HUMAN_SESSION_PURPOSE
        _record_auth_log(
            db,
            owner_id=user.id,
            client_id=user.pat_id or user.run_id or _UNKNOWN_CLIENT,
            scope="",
            resource=request.url.path,
            purpose=purpose,
            result="denied",
            error_code=ErrorCode.FORBIDDEN,
        )
        raise Forbidden("审批动作仅限人类会话，Agent 令牌不可调用")
    return user
