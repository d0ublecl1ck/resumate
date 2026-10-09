"""题库引用回填：按「题干 + role」检索知识库，命中才写 knowledge_refs。

默认只填空题（knowledge_refs 为 NULL 或空数组），已带引用的题跳过，避免覆盖人工
校对过的引用；--force 整库重算，命中则覆盖为真实切片出处，没有命中的题清空为 []。
两种情况都绝不伪造引用。
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.bank.models import BankQuestion

from . import service

DEFAULT_REF_LIMIT = 3


def backfill_knowledge_refs(
    db: Session,
    *,
    force: bool = False,
    ref_limit: int = DEFAULT_REF_LIMIT,
    role: str | None = None,
) -> dict[str, int]:
    """可重跑：返回真实统计 total / filled / no_match / skipped。"""
    statement = select(BankQuestion)
    if role:
        statement = statement.where(BankQuestion.role == role)
    questions = list(db.scalars(statement.order_by(BankQuestion.id)))

    filled = 0
    no_match = 0
    skipped = 0
    for question in questions:
        if (question.knowledge_refs or []) and not force:
            skipped += 1
            continue
        result = service.search(db, query=question.prompt, role=question.role, limit=ref_limit)
        refs: list[str] = []
        if result.status == "matched":
            for hit in result.results:
                if hit.source not in refs:
                    refs.append(hit.source)
        if not refs:
            no_match += 1
            # --force 是整库重算：没有真实命中的题清空引用，绝不保留假引用。
            if force:
                question.knowledge_refs = []
            continue
        question.knowledge_refs = refs
        filled += 1
    db.commit()
    return {"total": len(questions), "filled": filled, "no_match": no_match, "skipped": skipped}
