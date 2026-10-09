from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import SpeechSegment


def add_segment(db: Session, segment: SpeechSegment) -> None:
    db.add(segment)


def get_segment(db: Session, segment_id: str) -> SpeechSegment | None:
    return db.get(SpeechSegment, segment_id)


def list_segments_for_session(db: Session, owner_id: str, session_id: str) -> list[SpeechSegment]:
    """按属主 + 会话读回，按采集时间正序，便于前端按作答顺序聚合。"""
    statement = (
        select(SpeechSegment)
        .where(SpeechSegment.owner_id == owner_id, SpeechSegment.session_id == session_id)
        .order_by(SpeechSegment.created_at, SpeechSegment.id)
    )
    return list(db.scalars(statement))
