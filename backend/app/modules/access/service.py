import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.shared.errors import ResourceNotFound, ValidationFailed

from . import dao
from .models import AccessLog, PersonalAccessToken
from .schemas import (
    AccessLogResponse,
    CapabilityDiscoveryResponse,
    PersonalAccessTokenCreate,
    PersonalAccessTokenResponse,
)

TOKEN_PREFIX = "rsm_pat_"
TOKEN_BYTES = 24
EXPIRING_WINDOW = timedelta(days=30)
ALLOWED_SCOPES = ["profile:read", "resume:read", "resume:write", "jd:read", "jd:write"]
CONTRACT_VERSION = "v0.4"
CAPABILITIES = [
    "resume.crud",
    "resume.patch",
    "profile.facts",
    "jd.bind",
    "settings.read",
    "access.tokens",
    "backup.export",
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _status(token: PersonalAccessToken) -> str:
    if token.revoked_at is not None:
        return "revoked"
    if token.expires_at <= _now() + EXPIRING_WINDOW:
        return "expiring"
    return "active"


def _response(token: PersonalAccessToken, secret: str | None = None) -> PersonalAccessTokenResponse:
    return PersonalAccessTokenResponse(
        id=token.id,
        name=token.name,
        scopes=list(token.scopes),
        resources=list(token.resources),
        fields=list(token.fields),
        purpose=token.purpose,
        created_at=token.created_at,
        expires_at=token.expires_at,
        last_used_at=token.last_used_at,
        status=_status(token),
        secret_once=secret,
    )


def _record_log(
    db: Session,
    owner_id: str,
    *,
    client_id: str,
    scope: str,
    resource: str,
    purpose: str,
    result: str = "allowed",
    error_code: str | None = None,
) -> None:
    dao.add_log(
        db,
        AccessLog(
            id=_new_id("log"),
            owner_id=owner_id,
            at=_now(),
            client_id=client_id,
            scope=scope,
            resource=resource,
            purpose=purpose,
            result=result,
            error_code=error_code,
        ),
    )


def list_tokens(db: Session, user: CurrentUser) -> list[PersonalAccessTokenResponse]:
    return [_response(token) for token in dao.list_tokens(db, user.id)]


def create_token(db: Session, user: CurrentUser, payload: PersonalAccessTokenCreate) -> PersonalAccessTokenResponse:
    unknown = [scope for scope in payload.scopes if scope not in ALLOWED_SCOPES]
    if unknown:
        raise ValidationFailed("不支持的 scope：" + "、".join(unknown))
    secret = TOKEN_PREFIX + secrets.token_urlsafe(TOKEN_BYTES)
    now = _now()
    token = PersonalAccessToken(
        id=_new_id("pat"),
        owner_id=user.id,
        name=payload.name,
        scopes=list(payload.scopes),
        resources=list(payload.resources) or ["全部简历"],
        fields=list(payload.fields),
        purpose=payload.purpose,
        token_hash=hashlib.sha256(secret.encode("utf-8")).hexdigest(),
        token_prefix=secret[: len(TOKEN_PREFIX) + 4],
        created_at=now,
        expires_at=now + timedelta(days=payload.expires_in_days),
    )
    dao.add_token(db, token)
    _record_log(
        db,
        user.id,
        client_id=user.display_name,
        scope="access:write",
        resource=payload.name,
        purpose="token_create",
    )
    db.commit()
    db.refresh(token)
    return _response(token, secret=secret)


def revoke_token(db: Session, user: CurrentUser, token_id: str) -> PersonalAccessTokenResponse:
    token = dao.get_token(db, token_id)
    if token is None or token.owner_id != user.id:
        raise ResourceNotFound(f"访问令牌 {token_id} 不存在")
    if token.revoked_at is None:
        token.revoked_at = _now()
        _record_log(
            db,
            user.id,
            client_id=user.display_name,
            scope="access:write",
            resource=token.name,
            purpose="token_revoke",
        )
        db.commit()
        db.refresh(token)
    return _response(token)


def list_logs(db: Session, user: CurrentUser) -> list[AccessLogResponse]:
    return [
        AccessLogResponse(
            id=log.id,
            at=log.at,
            client_id=log.client_id,
            scope=log.scope,
            resource=log.resource,
            purpose=log.purpose,
            result=log.result,
            error_code=log.error_code,
        )
        for log in dao.list_logs(db, user.id)
    ]


def capability(base_url: str) -> CapabilityDiscoveryResponse:
    root = base_url if base_url.endswith("/") else base_url + "/"
    return CapabilityDiscoveryResponse(
        contract_version=CONTRACT_VERSION,
        openapi_url=root + "openapi.json",
        mcp_url=root + "mcp",
        well_known_url=root + ".well-known/resume-agent",
        auth_methods=["PAT (Bearer)", "单用户本地占位"],
        capabilities=list(CAPABILITIES),
    )
