"""题库引用回填：命中才写、未命中保持为空、默认可重跑不覆盖人工引用。

回填按「题干 + role」调 kb 检索；脚本与接口共用 app.modules.kb.backfill 的实现，
这里直接调用该函数并断言数据库里的真实结果。
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.bank import service as bank_service
from app.modules.bank.models import BankQuestion  # noqa: F401
from app.modules.kb import backfill as kb_backfill

NOW = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
JAVA = "Java 后端"
WEB = "Web 前端"
SPRING_DOC = """# Spring 事务管理

## 失效场景

自调用不经过代理、异常被 catch 吞掉、方法不是 public 时会失效。
"""
MATCHED_PROMPT = "Spring 事务在哪些情况下会失效？"
MISSED_PROMPT = "线上事故复盘时如何界定责任边界？"


def _seed_question(
    db: Session,
    *,
    prompt: str,
    role: str = JAVA,
    knowledge_refs: list[str] | None = None,
) -> BankQuestion:
    row = BankQuestion(
        id=f"bkq_bf_{abs(hash((role, prompt))) % (10**12):012d}",
        role=role,
        kind="technical",
        difficulty="medium",
        prompt=prompt,
        reference_points=["要点"],
        knowledge_refs=knowledge_refs,
        source="seed_model",
        batch_id="batch_backfill",
        prompt_hash=bank_service.prompt_hash(prompt),
        created_at=NOW,
        updated_at=NOW,
    )
    db.add(row)
    db.flush()
    return row


def _import_spring_doc(client: TestClient, role: str = JAVA) -> None:
    response = client.post(
        "/kb/documents",
        json={"title": "Spring 事务管理", "role": role, "sourceType": "markdown", "body": SPRING_DOC},
    )
    assert response.status_code == 201, response.text


def test_backfill_fills_matched_and_leaves_missed_empty(client: TestClient, db_session: Session) -> None:
    _import_spring_doc(client)
    matched = _seed_question(db_session, prompt=MATCHED_PROMPT)
    missed = _seed_question(db_session, prompt=MISSED_PROMPT)
    other_role = _seed_question(db_session, prompt=MATCHED_PROMPT, role=WEB)

    stats = kb_backfill.backfill_knowledge_refs(db_session)

    assert stats == {"total": 3, "filled": 1, "no_match": 2, "skipped": 0}
    db_session.refresh(matched)
    db_session.refresh(missed)
    db_session.refresh(other_role)
    assert matched.knowledge_refs == ["Spring 事务管理 · 失效场景"]
    # 无命中的题保持为空，不伪造引用。
    assert missed.knowledge_refs in (None, [])
    # 同题干不同 role 在 Web 前端下无文档，同样为空。
    assert other_role.knowledge_refs in (None, [])


def test_backfill_rerun_skips_existing_and_does_not_write_twice(client: TestClient, db_session: Session) -> None:
    _import_spring_doc(client)
    _seed_question(db_session, prompt=MATCHED_PROMPT)

    first = kb_backfill.backfill_knowledge_refs(db_session)
    second = kb_backfill.backfill_knowledge_refs(db_session)

    assert first["filled"] == 1
    assert second == {"total": 1, "filled": 0, "no_match": 0, "skipped": 1}


def test_backfill_force_overwrites_existing_refs(client: TestClient, db_session: Session) -> None:
    _import_spring_doc(client)
    row = _seed_question(db_session, prompt=MATCHED_PROMPT, knowledge_refs=["人工校对引用"])

    skipped = kb_backfill.backfill_knowledge_refs(db_session)
    assert skipped["skipped"] == 1
    db_session.refresh(row)
    assert row.knowledge_refs == ["人工校对引用"]

    forced = kb_backfill.backfill_knowledge_refs(db_session, force=True)
    assert forced["filled"] == 1
    db_session.refresh(row)
    assert row.knowledge_refs == ["Spring 事务管理 · 失效场景"]


def test_backfill_force_clears_refs_without_real_match(client: TestClient, db_session: Session) -> None:
    _import_spring_doc(client)
    row = _seed_question(db_session, prompt=MISSED_PROMPT, knowledge_refs=["人工校对引用"])

    stats = kb_backfill.backfill_knowledge_refs(db_session, force=True)

    assert stats["no_match"] == 1
    db_session.refresh(row)
    # --force 整库重算：没有真实命中的题清空引用，不保留假引用。
    assert row.knowledge_refs == []


def test_backfill_role_filter_limits_scope(client: TestClient, db_session: Session) -> None:
    _import_spring_doc(client, role=JAVA)
    java_row = _seed_question(db_session, prompt=MATCHED_PROMPT, role=JAVA)
    web_row = _seed_question(db_session, prompt=MATCHED_PROMPT, role=WEB)

    stats = kb_backfill.backfill_knowledge_refs(db_session, role=JAVA)

    assert stats["total"] == 1
    db_session.refresh(java_row)
    db_session.refresh(web_row)
    assert java_row.knowledge_refs == ["Spring 事务管理 · 失效场景"]
    assert web_row.knowledge_refs in (None, [])


def test_backfill_without_knowledge_base_is_all_no_match(db_session: Session) -> None:
    _seed_question(db_session, prompt=MATCHED_PROMPT)

    stats = kb_backfill.backfill_knowledge_refs(db_session)

    assert stats == {"total": 1, "filled": 0, "no_match": 1, "skipped": 0}
    assert db_session.scalars(select(BankQuestion)).one().knowledge_refs is None
