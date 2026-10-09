"""岗位题库：真实计数聚合、分页筛选、批量导入去重与权限契约。

导入走 POST /bank/import，计数走 GET /bank/stats，列表走 GET /bank/questions。
模型与生成脚本不在 pytest 覆盖范围内（真实生成由 scripts/generate_bank.py 完成）。
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.main import app
from app.modules.auth.deps import get_current_user
from app.modules.bank import service as bank_service
from app.modules.bank.models import BankQuestion  # noqa: F401  建表前先注册 metadata

from conftest import TEST_USER

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
JAVA = "Java 后端"
WEB = "Web 前端"


def _seed(
    db: Session,
    *,
    role: str = JAVA,
    kind: str = "technical",
    difficulty: str = "medium",
    prompt: str = "题干",
    reference_points: list[str] | None = None,
    knowledge_refs: list[str] | None = None,
    source: str = "import",
    batch_id: str = "batch_test",
) -> BankQuestion:
    row = BankQuestion(
        id=f"bkq_{abs(hash((role, prompt))) % (10**12):012d}",
        role=role,
        kind=kind,
        difficulty=difficulty,
        prompt=prompt,
        reference_points=reference_points or ["要点一", "要点二"],
        knowledge_refs=knowledge_refs,
        source=source,
        batch_id=batch_id,
        prompt_hash=bank_service.prompt_hash(prompt),
        created_at=NOW,
        updated_at=NOW,
    )
    db.add(row)
    db.flush()
    return row


def _stats(client: TestClient, **params: str) -> dict:
    response = client.get("/bank/stats", params=params)
    assert response.status_code == 200, response.text
    return response.json()


# ---------------------------------------------------------------------------
# 导入：去重 + 规范化空白 + 白名单校验
# ---------------------------------------------------------------------------


def test_import_creates_rows_and_skips_duplicate_prompt(client: TestClient, db_session: Session) -> None:
    payload = [
        {
            "role": JAVA,
            "kind": "technical",
            "difficulty": "medium",
            "prompt": "  Spring 事务在哪些情况下会失效？ ",
            "referencePoints": ["自调用不经过代理", "异常被 catch 吞掉"],
            "knowledgeRefs": ["Spring 事务管理 · 失效场景"],
        },
        {
            # 与上一条只差空白：规范化后 prompt_hash 相同，必须跳过。
            "role": JAVA,
            "kind": "technical",
            "difficulty": "easy",
            "prompt": "Spring事务在哪些情况下会失效？",
            "referencePoints": ["重复条目"],
        },
        {
            "role": JAVA,
            "kind": "deep_dive",
            "difficulty": "hard",
            "prompt": "订单服务做分库分表的容量依据是什么？",
            "referencePoints": ["单表数据量", "写入 QPS"],
        },
    ]

    response = client.post("/bank/import", json=payload)

    assert response.status_code == 201, response.text
    assert response.json() == {"created": 2, "skipped": 1}

    rows = list(db_session.scalars(select(BankQuestion).order_by(BankQuestion.prompt)))
    assert len(rows) == 2
    assert {row.kind for row in rows} == {"technical", "deep_dive"}
    # source 默认落 import，题干按原文保存但 hash 用去空白后的规范化题干。
    assert {row.source for row in rows} == {"import"}
    technical = next(row for row in rows if row.kind == "technical")
    assert technical.prompt == "Spring 事务在哪些情况下会失效？"
    expected = hashlib.sha256("Spring事务在哪些情况下会失效？".encode("utf-8")).hexdigest()
    assert technical.prompt_hash == expected


def test_import_keeps_same_prompt_for_different_role(client: TestClient, db_session: Session) -> None:
    prompt = "线上首屏变慢，你会如何定位？"
    response = client.post(
        "/bank/import",
        json=[
            {"role": JAVA, "kind": "scenario", "difficulty": "medium", "prompt": prompt},
            {"role": WEB, "kind": "scenario", "difficulty": "medium", "prompt": prompt},
        ],
    )

    assert response.status_code == 201, response.text
    assert response.json() == {"created": 2, "skipped": 0}
    # 唯一约束是 (role, prompt_hash)，跨岗位同题干各自保留。
    rows = list(db_session.scalars(select(BankQuestion)))
    assert {row.role for row in rows} == {JAVA, WEB}
    assert len({row.prompt_hash for row in rows}) == 1


def test_import_rejects_unknown_kind(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/bank/import",
        json=[{"role": JAVA, "kind": "quiz", "difficulty": "easy", "prompt": "非法题型"}],
    )

    assert response.status_code == 422, response.text
    body = response.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert "kind" in body["message"]
    # 不得把 pydantic 英文原文透出给用户。
    assert "Input should be" not in body["message"]
    assert db_session.scalars(select(BankQuestion)).first() is None


def test_import_rejects_unknown_difficulty(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/bank/import",
        json=[{"role": WEB, "kind": "technical", "difficulty": "nightmare", "prompt": "非法难度"}],
    )

    assert response.status_code == 422, response.text
    body = response.json()
    assert body["code"] == "VALIDATION_FAILED"
    assert "difficulty" in body["message"]
    assert db_session.scalars(select(BankQuestion)).first() is None


def test_import_cleans_reference_points_and_nullable_knowledge_refs(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/bank/import",
        json=[
            {
                "role": WEB,
                "kind": "behavioral",
                "difficulty": "easy",
                "prompt": "讲一次你推动工程规范落地的经历。",
                "referencePoints": [" 背景 ", "", "   ", "结果指标"],
                "knowledgeRefs": None,
            }
        ],
    )

    assert response.status_code == 201, response.text
    row = db_session.scalars(select(BankQuestion)).one()
    assert row.reference_points == ["背景", "结果指标"]
    assert row.knowledge_refs is None


# ---------------------------------------------------------------------------
# 计数聚合
# ---------------------------------------------------------------------------


def test_stats_aggregates_role_and_kind_counts(client: TestClient, db_session: Session) -> None:
    _seed(db_session, role=JAVA, kind="technical")
    _seed(db_session, role=JAVA, kind="technical", prompt="题二")
    _seed(db_session, role=JAVA, kind="deep_dive", prompt="题三")
    _seed(db_session, role=WEB, kind="behavioral", prompt="题四")

    body = _stats(client)

    assert body["total"] == 4
    by_role = {entry["role"]: entry for entry in body["roles"]}
    assert by_role[JAVA] == {"role": JAVA, "total": 3, "kinds": {"technical": 2, "deep_dive": 1}}
    assert by_role[WEB] == {"role": WEB, "total": 1, "kinds": {"behavioral": 1}}


def test_stats_filters_by_role(client: TestClient, db_session: Session) -> None:
    _seed(db_session, role=JAVA, kind="technical")
    _seed(db_session, role=WEB, kind="scenario", prompt="Web 场景题")

    body = _stats(client, role=JAVA)

    assert body == {
        "roles": [{"role": JAVA, "total": 1, "kinds": {"technical": 1}}],
        "total": 1,
    }


def test_stats_empty_bank_returns_zero(client: TestClient) -> None:
    assert _stats(client) == {"roles": [], "total": 0}


# ---------------------------------------------------------------------------
# 列表：分页、筛选、搜索
# ---------------------------------------------------------------------------


def test_questions_paginates_and_reports_filtered_total(client: TestClient, db_session: Session) -> None:
    for index in range(25):
        _seed(db_session, role=JAVA, kind="technical", prompt=f"并发题 {index:02d}")

    first = client.get("/bank/questions", params={"role": JAVA, "page": 1, "size": 10})
    assert first.status_code == 200, first.text
    assert len(first.json()) == 10
    assert first.headers["X-Total-Count"] == "25"

    last = client.get("/bank/questions", params={"role": JAVA, "page": 3, "size": 10})
    assert len(last.json()) == 5
    assert last.headers["X-Total-Count"] == "25"


def test_questions_filter_by_kind_difficulty_and_keyword(client: TestClient, db_session: Session) -> None:
    _seed(db_session, role=JAVA, kind="technical", difficulty="hard", prompt="Kafka 精确一次语义如何实现")
    _seed(db_session, role=JAVA, kind="technical", difficulty="easy", prompt="Redis 缓存穿透怎么防")
    _seed(db_session, role=JAVA, kind="scenario", difficulty="hard", prompt="大促流量突增十倍如何保护数据库")

    hard = client.get("/bank/questions", params={"role": JAVA, "difficulty": "hard"})
    assert hard.status_code == 200, hard.text
    assert hard.headers["X-Total-Count"] == "2"
    assert {item["difficulty"] for item in hard.json()} == {"hard"}

    scenario = client.get("/bank/questions", params={"role": JAVA, "kind": "scenario"})
    assert scenario.headers["X-Total-Count"] == "1"
    assert scenario.json()[0]["kind"] == "scenario"

    keyword = client.get("/bank/questions", params={"q": "缓存穿透"})
    assert keyword.headers["X-Total-Count"] == "1"
    assert keyword.json()[0]["prompt"] == "Redis 缓存穿透怎么防"


def test_questions_view_uses_camel_case_aliases(client: TestClient, db_session: Session) -> None:
    _seed(
        db_session,
        role=WEB,
        kind="technical",
        prompt="从输入 URL 到首屏渲染经历了哪些阶段？",
        knowledge_refs=["浏览器渲染 · 关键渲染路径"],
    )

    item = client.get("/bank/questions").json()[0]

    assert set(item) == {
        "id",
        "role",
        "kind",
        "difficulty",
        "prompt",
        "referencePoints",
        "knowledgeRefs",
        "source",
        "createdAt",
    }
    assert item["knowledgeRefs"] == ["浏览器渲染 · 关键渲染路径"]


def test_questions_rejects_bad_pagination_and_filters(client: TestClient) -> None:
    assert client.get("/bank/questions", params={"page": 0}).status_code == 422
    assert client.get("/bank/questions", params={"size": 0}).status_code == 422
    assert client.get("/bank/questions", params={"size": 101}).status_code == 422
    assert client.get("/bank/questions", params={"kind": "quiz"}).status_code == 422
    assert client.get("/bank/questions", params={"difficulty": "nightmare"}).status_code == 422


# ---------------------------------------------------------------------------
# 权限：读用通用读权限，导入用写权限（沿用仓库现有权限码，不自创）
# ---------------------------------------------------------------------------


def test_bank_read_requires_read_permission_and_import_requires_write(client: TestClient) -> None:
    reader = CurrentUser(
        id="user_reader",
        display_name="只读用户",
        role="user",
        roles=("user",),
        permissions=frozenset({"resume:read"}),
    )
    app.dependency_overrides[get_current_user] = lambda: reader
    try:
        assert client.get("/bank/stats").status_code == 200
        assert client.get("/bank/questions").status_code == 200
        denied = client.post(
            "/bank/import",
            json=[{"role": JAVA, "kind": "technical", "difficulty": "easy", "prompt": "受限导入"}],
        )
    finally:
        app.dependency_overrides[get_current_user] = lambda: TEST_USER

    assert denied.status_code == 403, denied.text
    assert denied.json()["code"] == "FORBIDDEN"


def test_bank_without_any_permission_is_forbidden(client: TestClient) -> None:
    nobody = CurrentUser(
        id="user_nobody",
        display_name="无权限用户",
        role="user",
        roles=("user",),
        permissions=frozenset(),
    )
    app.dependency_overrides[get_current_user] = lambda: nobody
    try:
        stats = client.get("/bank/stats")
        questions = client.get("/bank/questions")
        imported = client.post("/bank/import", json=[])
    finally:
        app.dependency_overrides[get_current_user] = lambda: TEST_USER

    assert stats.status_code == 403
    assert questions.status_code == 403
    assert imported.status_code == 403
