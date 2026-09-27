from dataclasses import dataclass

from fastapi import Query


@dataclass(frozen=True)
class CurrentUser:
    id: str
    display_name: str


@dataclass(frozen=True)
class PaginationParams:
    page: int
    size: int


LOCAL_USER = CurrentUser(id="user_local", display_name="本地用户")


def get_pagination(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100)) -> PaginationParams:
    return PaginationParams(page=page, size=size)


def get_current_user() -> CurrentUser:
    """Single-user placeholder until authentication is configured.

    Every request is attributed to the same local owner so business endpoints can
    resolve resource ownership now; replace this with the real auth contract
    before exposing the service to more than one user.
    """
    return LOCAL_USER
