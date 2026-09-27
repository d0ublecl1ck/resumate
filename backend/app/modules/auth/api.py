import redis
from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import CurrentUser
from app.core.redis import get_redis

from . import dao, service
from .deps import require_permission
from .models import User
from .schemas import (
    BanRequest,
    ChangePasswordRequest,
    LoginRequest,
    PermissionResponse,
    RegisterRequest,
    RoleResponse,
    RoleUpdateRequest,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=get_settings().session_cookie_name, path="/")


def _user_response(db: Session, user: User) -> UserResponse:
    roles = dao.list_user_roles(db, user.id)
    primary = max(roles, key=lambda role: role.rank).code if roles else "user"
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=primary,
        roles=[role.code for role in roles],
        permissions=sorted(dao.list_user_permission_codes(db, user.id)),
        is_banned=user.is_banned,
        created_at=user.created_at,
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
    client: redis.Redis = Depends(get_redis),
) -> UserResponse:
    user, token = service.register(db, client, payload)
    _set_session_cookie(response, token)
    return _user_response(db, user)


@router.post("/login", response_model=UserResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    client: redis.Redis = Depends(get_redis),
) -> UserResponse:
    user, token = service.login(db, client, payload)
    _set_session_cookie(response, token)
    return _user_response(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    client: redis.Redis = Depends(get_redis),
) -> None:
    service.logout(client, request.cookies.get(get_settings().session_cookie_name))
    _clear_session_cookie(response)


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    user: CurrentUser = Depends(require_permission("account:write")),
    db: Session = Depends(get_db),
    client: redis.Redis = Depends(get_redis),
) -> None:
    service.change_password(db, client, user.id, payload)
    _clear_session_cookie(response)


@router.get("/me", response_model=UserResponse)
def me(
    user: CurrentUser = Depends(require_permission("account:read")),
    db: Session = Depends(get_db),
) -> UserResponse:
    return _user_response(db, service.get_user_or_raise(db, user.id))


@router.get("/users", response_model=list[UserResponse])
def list_users(
    _: CurrentUser = Depends(require_permission("user:read")),
    db: Session = Depends(get_db),
) -> list[UserResponse]:
    return [_user_response(db, user) for user in service.list_users(db)]


@router.post("/users/{user_id}/ban", response_model=UserResponse)
def ban_user(
    user_id: str,
    payload: BanRequest,
    actor: CurrentUser = Depends(require_permission("user:ban")),
    db: Session = Depends(get_db),
    client: redis.Redis = Depends(get_redis),
) -> UserResponse:
    return _user_response(db, service.ban_user(db, client, actor, user_id, payload.reason))


@router.post("/users/{user_id}/unban", response_model=UserResponse)
def unban_user(
    user_id: str,
    actor: CurrentUser = Depends(require_permission("user:unban")),
    db: Session = Depends(get_db),
) -> UserResponse:
    return _user_response(db, service.unban_user(db, actor, user_id))


@router.get("/roles", response_model=list[RoleResponse])
def list_roles(
    _: CurrentUser = Depends(require_permission("role:read")),
    db: Session = Depends(get_db),
) -> list[RoleResponse]:
    return [
        RoleResponse(
            code=role.code,
            name=role.name,
            description=role.description,
            rank=role.rank,
            permissions=dao.list_role_permission_codes(db, role.id),
        )
        for role in service.list_roles(db)
    ]


@router.get("/permissions", response_model=list[PermissionResponse])
def list_permissions(
    _: CurrentUser = Depends(require_permission("role:read")),
    db: Session = Depends(get_db),
) -> list[PermissionResponse]:
    return [
        PermissionResponse(code=permission.code, group=permission.group, name=permission.name)
        for permission in service.list_permissions(db)
    ]


@router.post("/users/{user_id}/role", response_model=UserResponse)
def change_role(
    user_id: str,
    payload: RoleUpdateRequest,
    actor: CurrentUser = Depends(require_permission("role:assign")),
    db: Session = Depends(get_db),
) -> UserResponse:
    return _user_response(db, service.change_role(db, actor, user_id, payload.role))
