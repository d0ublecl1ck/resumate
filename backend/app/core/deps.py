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
    # "session" for the cookie flow; "pat" for a Bearer personal access token.
    # pat_id / scopes are only meaningful for the latter and default empty so
    # existing session-based constructions keep working.
    auth_kind: str = "session"
    pat_id: str | None = None
    # Only meaningful for auth_kind == "run": the supervised run this credential
    # was minted for. Used for audit and as the server-fixed client id.
    run_id: str | None = None
    scopes: frozenset[str] = frozenset()
    # Server-fixed client identifier for PAT calls (token name, falling back to
    # pat_id). Session callers leave it None and may self-report clientId.
    client_id: str | None = None


@dataclass(frozen=True)
class PaginationParams:
    page: int
    size: int


def get_pagination(page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100)) -> PaginationParams:
    return PaginationParams(page=page, size=size)
