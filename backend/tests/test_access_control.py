import pytest
from fastapi.routing import APIRoute

from app.core.deps import CurrentUser
from app.main import app
from app.modules.auth import service
from app.modules.auth.rbac import PERMISSION_CODES
from app.shared.errors import ValidationFailed
from app.tasks.seed import seed_admin

# Endpoints that intentionally require no login and therefore no permission.
PUBLIC_ROUTES = {
    ("GET", "/health/"),
    ("POST", "/auth/register"),
    ("POST", "/auth/login"),
    ("POST", "/auth/logout"),
    ("GET", "/templates"),
    ("GET", "/templates/{template_id}"),
    ("GET", "/.well-known/resume-agent"),
}


def _required_permissions(route: APIRoute) -> set[str]:
    found: set[str] = set()
    stack = [route.dependant]
    while stack:
        dependant = stack.pop()
        for sub in dependant.dependencies:
            code = getattr(sub.call, "__required_permission__", None)
            if code:
                found.add(code)
            stack.append(sub)
    return found


def _iter_routes():
    for route in app.routes:
        if isinstance(route, APIRoute):
            for method in route.methods:
                if method not in {"HEAD", "OPTIONS"}:
                    yield method, route


def test_every_route_declares_exactly_one_permission() -> None:
    missing = []
    ambiguous = []
    for method, route in _iter_routes():
        if (method, route.path) in PUBLIC_ROUTES:
            continue
        codes = _required_permissions(route)
        if not codes:
            missing.append((method, route.path))
        elif len(codes) != 1:
            ambiguous.append((method, route.path, sorted(codes)))
    assert missing == []
    assert ambiguous == []


def test_public_routes_are_not_permission_gated() -> None:
    for method, route in _iter_routes():
        if (method, route.path) in PUBLIC_ROUTES:
            assert _required_permissions(route) == set(), (method, route.path)


def test_declared_permissions_exist_in_catalogue() -> None:
    for _, route in _iter_routes():
        for code in _required_permissions(route):
            assert code in PERMISSION_CODES, (route.path, code)


def _register(client, email: str = "user@example.com", password: str = "password123", name: str = "普通用户"):
    return client.post("/auth/register", json={"email": email, "password": password, "displayName": name})


def _login(client, email: str, password: str):
    return client.post("/auth/login", json={"email": email, "password": password})


def _login_bootstrap(client):
    return _login(client, "admin@resumate.dev", "resumate-admin")


def _promote(superclient, user_id: str, role: str):
    response = superclient.post(f"/auth/users/{user_id}/role", json={"role": role})
    assert response.status_code == 200, response.text
    return response


def test_regular_user_cannot_read_user_list(session_clients) -> None:
    client = session_clients()
    _register(client)

    response = client.get("/auth/users")

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


def test_super_admin_can_read_users_roles_permissions(session_clients, db_session) -> None:
    seed_admin(db_session)
    client = session_clients()
    _login_bootstrap(client)

    assert client.get("/auth/users").status_code == 200
    roles = client.get("/auth/roles").json()
    assert {role["code"] for role in roles} == {"user", "admin", "super_admin"}
    assert client.get("/auth/permissions").status_code == 200


def test_promoted_admin_can_list_users_but_not_assign_roles(session_clients, db_session) -> None:
    seed_admin(db_session)
    superclient = session_clients()
    _login_bootstrap(superclient)
    target = session_clients()
    _register(target, email="admin2@example.com")
    target_id = target.get("/auth/me").json()["id"]
    _promote(superclient, target_id, "admin")

    assert target.get("/auth/me").json()["roles"] == ["admin"]
    assert target.get("/auth/users").status_code == 200
    assert target.post(f"/auth/users/{target_id}/role", json={"role": "user"}).status_code == 403


def test_admin_cannot_ban_peer_admin(session_clients, db_session) -> None:
    seed_admin(db_session)
    superclient = session_clients()
    _login_bootstrap(superclient)
    first = session_clients()
    _register(first, email="admin_a@example.com")
    first_id = first.get("/auth/me").json()["id"]
    second = session_clients()
    _register(second, email="admin_b@example.com")
    second_id = second.get("/auth/me").json()["id"]
    _promote(superclient, first_id, "admin")
    _promote(superclient, second_id, "admin")

    response = first.post(f"/auth/users/{second_id}/ban", json={"reason": "x"})

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


def test_super_admin_can_ban_and_unban_regular_user(session_clients, db_session) -> None:
    seed_admin(db_session)
    superclient = session_clients()
    _login_bootstrap(superclient)
    victim = session_clients()
    _register(victim, email="victim@example.com")
    victim_id = victim.get("/auth/me").json()["id"]

    banned = superclient.post(f"/auth/users/{victim_id}/ban", json={"reason": "违规"})
    unbanned = superclient.post(f"/auth/users/{victim_id}/unban")

    assert banned.status_code == 200
    assert banned.json()["isBanned"] is True
    assert unbanned.status_code == 200
    assert unbanned.json()["isBanned"] is False


def test_actor_cannot_change_own_role(session_clients, db_session) -> None:
    seed_admin(db_session)
    superclient = session_clients()
    _login_bootstrap(superclient)
    admin_id = superclient.get("/auth/me").json()["id"]

    response = superclient.post(f"/auth/users/{admin_id}/role", json={"role": "user"})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_last_super_admin_cannot_be_demoted(db_session) -> None:
    seed_admin(db_session)
    ghost = CurrentUser(
        id="ghost",
        display_name="ghost",
        role="super_admin",
        roles=("super_admin",),
        permissions=frozenset(PERMISSION_CODES),
    )

    with pytest.raises(ValidationFailed):
        service.change_role(db_session, ghost, "user_admin", "user")
