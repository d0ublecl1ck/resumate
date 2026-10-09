"""岗位题库服务：真实计数聚合、分页筛选、批量导入去重。

题干去重口径固定为「去掉全部空白后取 sha256」，生成脚本与导入接口共用
prompt_hash，保证同一条题干不会因为换行或空格差异重复入库。
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.shared.errors import ValidationFailed

from . import dao
from .models import BankQuestion
from .schemas import (
    BankImportResult,
    BankQuestionImport,
    BankQuestionView,
    BankRoleStats,
    BankStats,
)

# 单次导入的数组上限：防止一次请求长时间占用数据库事务。
MAX_IMPORT_BATCH = 500
_WHITESPACE_RE = re.compile(r"\s+")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return f"bkq_{uuid4().hex[:12]}"


def normalize_prompt(prompt: str) -> str:
    """规范化题干：去掉全部空白字符，作为去重指纹的输入。"""
    return _WHITESPACE_RE.sub("", prompt)


def prompt_hash(prompt: str) -> str:
    """(role, prompt) 去重用的 sha256；生成脚本与导入接口必须用同一口径。"""
    return hashlib.sha256(normalize_prompt(prompt).encode("utf-8")).hexdigest()


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def get_stats(db: Session, *, role: str | None = None) -> BankStats:
    rows = dao.count_by_role_kind(db, role=_clean_text(role))
    totals: dict[str, int] = {}
    kinds: dict[str, dict[str, int]] = {}
    for row_role, kind, count in rows:
        totals[row_role] = totals.get(row_role, 0) + count
        kinds.setdefault(row_role, {})[kind] = count
    roles = [
        BankRoleStats(role=name, total=totals[name], kinds=kinds.get(name, {}))
        for name in sorted(totals)
    ]
    return BankStats(roles=roles, total=sum(totals.values()))


def list_questions(
    db: Session,
    *,
    role: str | None = None,
    kind: str | None = None,
    difficulty: str | None = None,
    query: str | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[list[BankQuestionView], int]:
    rows, total = dao.list_questions(
        db,
        role=_clean_text(role),
        kind=_clean_text(kind),
        difficulty=_clean_text(difficulty),
        query=_clean_text(query),
        page=page,
        size=size,
    )
    return [BankQuestionView.model_validate(row) for row in rows], total


def import_questions(db: Session, payload: list[BankQuestionImport]) -> BankImportResult:
    """批量导入：同岗位重复题干跳过，其余入库；返回 created/skipped 真实计数。"""
    if len(payload) > MAX_IMPORT_BATCH:
        raise ValidationFailed(f"一次最多导入 {MAX_IMPORT_BATCH} 道题")

    now = _now()
    seen = dao.existing_hashes(db, roles=sorted({item.role for item in payload}))
    fallback_batch = f"import_{uuid4().hex[:12]}"
    created = 0
    skipped = 0
    for item in payload:
        digest = prompt_hash(item.prompt)
        key = (item.role, digest)
        if key in seen:
            skipped += 1
            continue
        seen.add(key)
        dao.add_question(
            db,
            BankQuestion(
                id=_new_id(),
                role=item.role,
                kind=item.kind,
                difficulty=item.difficulty,
                prompt=item.prompt,
                reference_points=list(item.reference_points),
                knowledge_refs=list(item.knowledge_refs) if item.knowledge_refs is not None else None,
                source=item.source,
                batch_id=item.batch_id or fallback_batch,
                prompt_hash=digest,
                created_at=now,
                updated_at=now,
            ),
        )
        created += 1
    db.commit()
    return BankImportResult(created=created, skipped=skipped)
