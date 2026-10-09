from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    InterviewAnswer,
    InterviewQuestion,
    InterviewReport,
    InterviewSession,
    PracticeItem,
)


def list_sessions(db: Session, owner_id: str) -> list[InterviewSession]:
    statement = (
        select(InterviewSession)
        .where(InterviewSession.owner_id == owner_id)
        .order_by(InterviewSession.created_at.desc())
    )
    return list(db.scalars(statement))


def get_session(db: Session, session_id: str) -> InterviewSession | None:
    return db.get(InterviewSession, session_id)


def add_session(db: Session, session: InterviewSession) -> None:
    db.add(session)


def list_questions(db: Session, session_id: str) -> list[InterviewQuestion]:
    statement = (
        select(InterviewQuestion)
        .where(InterviewQuestion.session_id == session_id)
        .order_by(InterviewQuestion.ordinal)
    )
    return list(db.scalars(statement))


def get_question(db: Session, question_id: str) -> InterviewQuestion | None:
    return db.get(InterviewQuestion, question_id)


def add_question(db: Session, question: InterviewQuestion) -> None:
    db.add(question)


def count_questions(db: Session, session_id: str) -> int:
    statement = select(InterviewQuestion.id).where(InterviewQuestion.session_id == session_id)
    return len(list(db.scalars(statement)))


def list_answers(db: Session, session_id: str) -> list[InterviewAnswer]:
    statement = (
        select(InterviewAnswer)
        .where(InterviewAnswer.session_id == session_id)
        .order_by(InterviewAnswer.created_at, InterviewAnswer.id)
    )
    return list(db.scalars(statement))


def get_answer_by_key(db: Session, question_id: str, idempotency_key: str) -> InterviewAnswer | None:
    statement = select(InterviewAnswer).where(
        InterviewAnswer.question_id == question_id,
        InterviewAnswer.idempotency_key == idempotency_key,
    )
    return db.scalars(statement).first()


def get_latest_answer(db: Session, question_id: str) -> InterviewAnswer | None:
    statement = (
        select(InterviewAnswer)
        .where(InterviewAnswer.question_id == question_id)
        .order_by(InterviewAnswer.created_at.desc(), InterviewAnswer.id.desc())
    )
    return db.scalars(statement).first()


def add_answer(db: Session, answer: InterviewAnswer) -> None:
    db.add(answer)


def get_follow_up_for_answer(db: Session, answer_id: str) -> InterviewQuestion | None:
    statement = select(InterviewQuestion).where(InterviewQuestion.derived_from_answer_id == answer_id)
    return db.scalars(statement).first()


def get_report(db: Session, session_id: str) -> InterviewReport | None:
    statement = select(InterviewReport).where(InterviewReport.session_id == session_id)
    return db.scalars(statement).first()


def add_report(db: Session, report: InterviewReport) -> None:
    db.add(report)

def list_sessions_with_reports(db: Session, owner_id: str, role: str | None = None) -> list[InterviewSession]:
    """已产出报告的真实场次，按时间正序；成长曲线只认这些点。"""
    statement = (
        select(InterviewSession)
        .join(InterviewReport, InterviewReport.session_id == InterviewSession.id)
        .where(InterviewSession.owner_id == owner_id)
    )
    if role:
        statement = statement.where(InterviewSession.role == role)
    statement = statement.order_by(InterviewSession.created_at.asc(), InterviewSession.id.asc())
    return list(db.scalars(statement))


def delete_questions_for_session(db: Session, session_id: str) -> None:
    for question in list_questions(db, session_id):
        db.delete(question)


def list_practice_items(db: Session, owner_id: str, role: str | None = None) -> list[PracticeItem]:
    statement = select(PracticeItem).where(PracticeItem.owner_id == owner_id)
    if role:
        statement = statement.where(PracticeItem.role == role)
    statement = statement.order_by(PracticeItem.created_at.desc(), PracticeItem.id.desc())
    return list(db.scalars(statement))


def get_practice_item(db: Session, item_id: str) -> PracticeItem | None:
    return db.get(PracticeItem, item_id)


def get_practice_item_for_report_dimension(db: Session, report_id: str, dimension: str) -> PracticeItem | None:
    statement = select(PracticeItem).where(
        PracticeItem.source_report_id == report_id,
        PracticeItem.dimension == dimension,
    )
    return db.scalars(statement).first()


def add_practice_item(db: Session, item: PracticeItem) -> None:
    db.add(item)
