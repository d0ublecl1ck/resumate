from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import CurrentUser
from app.modules.auth.deps import require_permission

from . import service
from .schemas import (
    SpeechSegmentCreate,
    SpeechSegmentView,
    SpeechSynthesisRequest,
    SpeechTranscribeRequest,
    SpeechTranscriptionView,
)

# 语音指标是面试能力的附属数据：读写沿用岗位域权限码 jd:read / jd:write，
# 不新增权限码，避免改动 RBAC 目录。
router = APIRouter(tags=["speech"])


@router.post("/speech/transcribe", response_model=SpeechTranscriptionView)
def transcribe_speech(
    payload: SpeechTranscribeRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> SpeechTranscriptionView:
    """把一段录音交给云端 ASR；原始音频只在内存中流转，处理完即弃。"""
    return service.transcribe_answer(db, user, payload)


@router.post("/speech/segments", response_model=SpeechSegmentView, status_code=status.HTTP_201_CREATED)
def create_speech_segment(
    payload: SpeechSegmentCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> SpeechSegmentView:
    return service.record_segment(db, user.id, payload)


@router.get("/speech/segments", response_model=list[SpeechSegmentView])
def list_speech_segments(
    sessionId: str = Query(min_length=1, max_length=64),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:read")),
) -> list[SpeechSegmentView]:
    return service.list_segments(db, user.id, sessionId)


@router.post("/speech/synthesize")
def synthesize_speech(
    payload: SpeechSynthesisRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_permission("jd:write")),
) -> Response:
    """把题干文本交给云端 TTS，服务端取回音频字节后直接回传。

    返回值是音频二进制而不是一过性签名 URL：签名 URL 会在几分钟内过期，直接发给
    浏览器既暴露签名、又无法统一处理过期重试；音频不落盘、只走内存。
    """
    audio = service.synthesize_speech(db, user, payload)
    return Response(
        content=audio.audio,
        media_type=audio.content_type,
        headers={"Cache-Control": "no-store"},
    )
