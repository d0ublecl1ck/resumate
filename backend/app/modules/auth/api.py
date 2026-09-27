import redis
from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.deps import CurrentUser
from app.core.redis import get_redis

from . import service
from .deps import get_current_user, require_admin
from .models import User
from .schemas import BanRequest, ChangePasswordRequest, LoginRequest, RegisterRequest, UserResponse

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


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
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
    return _user_response(user)


@router.post("/login", response_model=UserResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    client: redis.Redis = Depends(get_redis),
) -> UserResponse:
    user, token = service.login(db, client, payload)
    _set_session_cookie(response, token)
    return _user_response(user)


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
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
    client: redis.Redis = Depends(get_redis),
) -> None:
    service.change_password(db, client, user.id, payload)
    _clear_session_cookie(response)


@router.post("/users/{user_id}/ban", response_model=UserResponse)
def ban_user(
    user_id: str,
    payload: BanRequest,
    admin: CurrentUser = Depends(require_admin),
    db: Session = Depends(get_db),
    client: redis.Redis = Depends(get_redis),
) -> UserResponse:
    return _user_response(service.ban_user(db, client, admin.id, user_id, payload.reason))


@router.get("/me", response_model=UserResponse)
def me(
    user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserResponse:
    return _user_response(service.get_user_or_raise(db, user.id))
