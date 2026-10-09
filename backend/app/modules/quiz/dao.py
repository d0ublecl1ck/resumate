from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.bank.models import BankQuestion

from .models import QuizAnswer, QuizAttempt


def add_attempt(db: Session, attempt: QuizAttempt) -> None:
    db.add(attempt)


def get_attempt(db: Session, attempt_id: str) -> QuizAttempt | None:
    return db.get(QuizAttempt, attempt_id)


def list_attempts(db: Session, owner_id: str) -> list[QuizAttempt]:
    statement = (
        select(QuizAttempt)
        .where(QuizAttempt.owner_id == owner_id)
        .order_by(QuizAttempt.created_at.desc())
    )
    return list(db.scalars(statement))


def list_answers(db: Session, attempt_id: str) -> list[QuizAnswer]:
    statement = (
        select(QuizAnswer)
        .where(QuizAnswer.attempt_id == attempt_id)
        .order_by(QuizAnswer.created_at, QuizAnswer.id)
    )
    return list(db.scalars(statement))


def get_answer_by_key(db: Session, question_id: str, idempotency_key: str) -> QuizAnswer | None:
    statement = select(QuizAnswer).where(
        QuizAnswer.question_id == question_id,
        QuizAnswer.idempotency_key == idempotency_key,
    )
    return db.scalars(statement).first()


def add_answer(db: Session, answer: QuizAnswer) -> None:
    db.add(answer)


def list_bank_open_questions(db: Session, role: str, *, limit: int = 1) -> list[BankQuestion]:
    """题库适配层：按岗位取开放题（新题在前）；bank 未就绪/为空时返回空列表。"""
    statement = (
        select(BankQuestion)
        .where(BankQuestion.role == role)
        .order_by(BankQuestion.created_at.desc(), BankQuestion.id.desc())
        .limit(limit)
    )
    return list(db.scalars(statement))
