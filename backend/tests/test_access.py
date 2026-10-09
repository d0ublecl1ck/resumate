import hashlib
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.main import app
from app.modules.access.models import AccessLog, PersonalAccessToken
from app.modules.auth.deps import get_current_user

from conftest import TEST_USER


def test_create_token_returns_secret_once_and_stores_hash(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/access/tokens",
        json={"name": "本地 MCP 客户端", "scopes": ["profile:read", "resume:write"], "purpose": "在编辑器里生成岗位简历"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["secretOnce"].startswith("rsm_pat_")
    assert body["status"] == "active"

    listing = client.get("/access/tokens").json()
    assert listing[0]["id"] == body["id"]
    assert listing[0]["secretOnce"] is None

    row = db_session.scalar(select(PersonalAccessToken))
    assert row is not None
    assert row.token_hash == hashlib.sha256(body["secretOnce"].encode("utf-8")).hexdigest()
    assert body["secretOnce"] not in row.token_hash


def test_revoke_is_idempotent_and_audited(client: TestClient) -> None:
    created = client.post("/access/tokens", json={"name": "导出脚本", "scopes": ["resume:read"]}).json()

    first = client.post(f"/access/tokens/{created['id']}/revoke")
    second = client.post(f"/access/tokens/{created['id']}/revoke")

    assert first.status_code == 200
    assert first.json()["status"] == "revoked"
    assert second.status_code == 200
    assert second.json()["status"] == "revoked"

    purposes = [log["purpose"] for log in client.get("/access/logs").json()]
    assert purposes.count("token_create") == 1
    assert purposes.count("token_revoke") == 1


def test_unknown_scope_is_rejected(client: TestClient) -> None:
    response = client.post("/access/tokens", json={"name": "越权", "scopes": ["admin:all"]})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_revoke_missing_token_returns_not_found(client: TestClient) -> None:
    response = client.post("/access/tokens/pat_missing/revoke")

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_capability_discovery(client: TestClient) -> None:
    body = client.get("/.well-known/resume-agent").json()

    assert body["contractVersion"] == "v0.4"
    assert "backup.export" in body["capabilities"]
    assert body["wellKnownUrl"].endswith("/.well-known/resume-agent")

# ---------------------------------------------------------------------------
# 访问审计日志：分页 / 筛选 / 排序 / 非法参数 / 权限（c3825）
# ---------------------------------------------------------------------------


def _seed_logs(
    db_session: Session,
    rows: list[tuple[str, str, str, str, str]],
) -> None:
    """Insert audit rows for the stubbed user, oldest first, one minute apart."""
    base = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for index, (purpose, result, client_id, scope, resource) in enumerate(rows):
        db_session.add(
            AccessLog(
                id=f"log_seed_{index}",
                owner_id=TEST_USER.id,
                at=base + timedelta(minutes=index),
                client_id=client_id,
                scope=scope,
                resource=resource,
                purpose=purpose,
                result=result,
            )
        )
    db_session.flush()


def test_logs_pagination_respects_page_size_and_total_header(client: TestClient, db_session: Session) -> None:
    _seed_logs(db_session, [("pat_auth", "allowed", "cli", "resume:read", f"r{index}") for index in range(5)])

    first = client.get("/access/logs", params={"page": 1, "size": 2})
    assert first.status_code == 200
    assert first.headers["X-Total-Count"] == "5"
    assert len(first.json()) == 2

    third = client.get("/access/logs", params={"page": 3, "size": 2})
    assert third.status_code == 200
    assert third.headers["X-Total-Count"] == "5"
    assert len(third.json()) == 1

    beyond = client.get("/access/logs", params={"page": 4, "size": 2})
    assert beyond.status_code == 200
    assert beyond.json() == []
    assert beyond.headers["X-Total-Count"] == "5"


def test_logs_are_ordered_by_at_desc(client: TestClient, db_session: Session) -> None:
    _seed_logs(db_session, [("pat_auth", "allowed", "cli", "resume:read", f"r{index}") for index in range(3)])

    resources = [row["resource"] for row in client.get("/access/logs").json()]

    assert resources == ["r2", "r1", "r0"]


def test_logs_filter_by_purpose_and_result(client: TestClient, db_session: Session) -> None:
    _seed_logs(
        db_session,
        [
            ("token_create", "allowed", "a", "access:write", "one"),
            ("token_revoke", "allowed", "b", "access:write", "two"),
            ("pat_scope", "denied", "c", "resume:read", "three"),
        ],
    )

    by_purpose = client.get("/access/logs", params={"purpose": "token_create"}).json()
    assert [row["purpose"] for row in by_purpose] == ["token_create"]

    by_result = client.get("/access/logs", params={"result": "denied"}).json()
    assert [row["result"] for row in by_result] == ["denied"]

    combined = client.get("/access/logs", params={"purpose": "token_create", "result": "denied"}).json()
    assert combined == []


def test_logs_keyword_matches_client_scope_and_resource(client: TestClient, db_session: Session) -> None:
    _seed_logs(
        db_session,
        [
            ("pat_auth", "allowed", "Acme CLI", "resume:read", "/resumes"),
            ("pat_auth", "allowed", "other", "profile:read", "Acme Profile"),
            ("pat_auth", "allowed", "third", "jd:write", "/jds"),
        ],
    )

    # 大小写不敏感，且 client_id / scope / resource 任一命中都算。
    assert len(client.get("/access/logs", params={"q": "acme"}).json()) == 2
    assert len(client.get("/access/logs", params={"q": "resume:read"}).json()) == 1
    assert client.get("/access/logs", params={"q": "nomatch"}).json() == []


def test_logs_reject_invalid_pagination_and_result(client: TestClient) -> None:
    assert client.get("/access/logs", params={"page": 0}).status_code == 422
    assert client.get("/access/logs", params={"size": 0}).status_code == 422
    assert client.get("/access/logs", params={"size": 101}).status_code == 422
    assert client.get("/access/logs", params={"result": "unknown"}).status_code == 422


def test_logs_unknown_purpose_is_normalized_to_empty_result(client: TestClient, db_session: Session) -> None:
    _seed_logs(db_session, [("pat_auth", "allowed", "cli", "resume:read", "r0")])

    response = client.get("/access/logs", params={"purpose": "does_not_exist"})

    assert response.status_code == 200
    assert response.json() == []
    assert response.headers["X-Total-Count"] == "0"


def test_logs_require_access_read_permission(client: TestClient) -> None:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id="user_limited",
        display_name="受限用户",
        role="user",
        roles=("user",),
        permissions=frozenset({"resume:read"}),
    )
    try:
        response = client.get("/access/logs")
    finally:
        app.dependency_overrides[get_current_user] = lambda: TEST_USER

    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"

# ---------------------------------------------------------------------------
# 访问审计日志：时间范围 from/to（闭区间、时区归一化、边界校验）
# ---------------------------------------------------------------------------


def test_logs_time_range_is_inclusive_on_both_bounds(client: TestClient, db_session: Session) -> None:
    _seed_logs(db_session, [("pat_auth", "allowed", "cli", "resume:read", f"r{index}") for index in range(5)])

    response = client.get(
        "/access/logs",
        params={"from": "2026-01-01T00:01:00Z", "to": "2026-01-01T00:03:00Z"},
    )

    assert response.status_code == 200
    assert response.headers["X-Total-Count"] == "3"
    assert [row["resource"] for row in response.json()] == ["r3", "r2", "r1"]


def test_logs_time_range_supports_single_sided_filters(client: TestClient, db_session: Session) -> None:
    _seed_logs(db_session, [("pat_auth", "allowed", "cli", "resume:read", f"r{index}") for index in range(4)])

    from_only = client.get("/access/logs", params={"from": "2026-01-01T00:02:00Z"})
    to_only = client.get("/access/logs", params={"to": "2026-01-01T00:01:00Z"})

    assert [row["resource"] for row in from_only.json()] == ["r3", "r2"]
    assert from_only.headers["X-Total-Count"] == "2"
    assert [row["resource"] for row in to_only.json()] == ["r1", "r0"]
    assert to_only.headers["X-Total-Count"] == "2"


def test_logs_naive_and_offset_times_are_normalized_to_utc(client: TestClient, db_session: Session) -> None:
    _seed_logs(db_session, [("pat_auth", "allowed", "cli", "resume:read", f"r{index}") for index in range(3)])

    naive = client.get(
        "/access/logs",
        params={"from": "2026-01-01T00:01:00", "to": "2026-01-01T00:01:00"},
    )
    aware = client.get(
        "/access/logs",
        params={"from": "2026-01-01T00:01:00+00:00", "to": "2026-01-01T00:01:00+00:00"},
    )
    offset = client.get(
        "/access/logs",
        params={"from": "2026-01-01T08:01:00+08:00", "to": "2026-01-01T08:01:00+08:00"},
    )

    assert naive.status_code == 200
    assert [row["resource"] for row in naive.json()] == ["r1"]
    # naive 被当作 UTC，与显式 UTC / +08:00 入参结果一致，不会出现 naive vs aware 运行期错误。
    assert naive.json() == aware.json()
    assert naive.json() == offset.json()


def test_logs_reject_reversed_time_range(client: TestClient) -> None:
    response = client.get(
        "/access/logs",
        params={"from": "2026-01-01T00:05:00Z", "to": "2026-01-01T00:01:00Z"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert "时间范围" in body["message"]
    # 负向：不能把内部异常原文透出给客户端。
    assert "Traceback" not in body["message"]
    assert "ValueError" not in body["message"]


def test_logs_reject_malformed_iso_datetime(client: TestClient) -> None:
    response = client.get("/access/logs", params={"from": "not-a-date"})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_access_logs_openapi_exposes_from_and_to(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()

    names = {parameter["name"] for parameter in spec["paths"]["/access/logs"]["get"]["parameters"]}

    assert {"from", "to"} <= names

