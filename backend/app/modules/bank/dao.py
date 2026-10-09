from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import BankQuestion


def add_question(db: Session, question: BankQuestion) -> None:
    db.add(question)


def count_by_role_kind(db: Session, *, role: str | None = None) -> list[tuple[str, str, int]]:
    """按 (role, kind) 聚合真实题数，供 /bank/stats 使用。"""
    statement = select(BankQuestion.role, BankQuestion.kind, func.count()).group_by(
        BankQuestion.role,
        BankQuestion.kind,
    )
    if role:
        statement = statement.where(BankQuestion.role == role)
    return [(str(row[0]), str(row[1]), int(row[2])) for row in db.execute(statement)]


def existing_hashes(db: Session, *, roles: list[str]) -> set[tuple[str, str]]:
    """返回这些岗位下已存在的 (role, prompt_hash)，用于导入前一次性去重。"""
    if not roles:
        return set()
    statement = select(BankQuestion.role, BankQuestion.prompt_hash).where(BankQuestion.role.in_(roles))
    return {(str(row[0]), str(row[1])) for row in db.execute(statement)}


def list_questions(
    db: Session,
    *,
    role: str | None = None,
    kind: str | None = None,
    difficulty: str | None = None,
    query: str | None = None,
    page: int = 1,
    size: int = 20,
) -> tuple[list[BankQuestion], int]:
    """返回一页题目（新题在前）与筛选后的真实总数。"""
    filters = []
    if role:
        filters.append(BankQuestion.role == role)
    if kind:
        filters.append(BankQuestion.kind == kind)
    if difficulty:
        filters.append(BankQuestion.difficulty == difficulty)
    if query:
        filters.append(BankQuestion.prompt.ilike(f"%{query}%"))
    total = db.scalar(select(func.count()).select_from(BankQuestion).where(*filters)) or 0
    statement = (
        select(BankQuestion)
        .where(*filters)
        .order_by(BankQuestion.created_at.desc(), BankQuestion.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    return list(db.scalars(statement)), int(total)
