from dataclasses import dataclass

from fastapi import Query


@dataclass(frozen=True)
class CurrentUser:
    """Authenticated principal with the roles and permissions resolved for this request.

    role is the highest-ranked role code, kept for display; roles and permissions
    are the full RBAC projection loaded from user_roles / role_permissions.
    """

    id: str
    display_name: str
    role: str = "user"
    roles: tuple[str, ...] = ()
    permissions: frozenset[str] = frozenset()


@dataclass(frozen=True)
class PaginationParams:
    page: int
    size: int


def get_pagination(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100)) -> PaginationParams:
    return PaginationParams(page=page, size=size)
