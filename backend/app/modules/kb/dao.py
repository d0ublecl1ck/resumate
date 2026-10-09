from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import KbChunk, KbDocument


def add_document(db: Session, document: KbDocument) -> None:
    db.add(document)


def add_chunk(db: Session, chunk: KbChunk) -> None:
    db.add(chunk)


def list_documents(db: Session, *, role: str | None = None) -> list[KbDocument]:
    statement = select(KbDocument)
    if role:
        statement = statement.where(KbDocument.role == role)
    statement = statement.order_by(KbDocument.created_at.desc(), KbDocument.id.desc())
    return list(db.scalars(statement))


def list_chunks_with_documents(
    db: Session,
    *,
    role: str | None = None,
) -> list[tuple[KbChunk, KbDocument]]:
    """返回 (chunk, document) 对；role 过滤在文档侧完成，保证岗位隔离。"""
    statement = select(KbChunk, KbDocument).join(KbDocument, KbChunk.document_id == KbDocument.id)
    if role:
        statement = statement.where(KbDocument.role == role)
    statement = statement.order_by(KbChunk.document_id, KbChunk.ordinal)
    return [(row[0], row[1]) for row in db.execute(statement)]
