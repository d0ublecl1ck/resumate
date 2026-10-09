"""语音作答指标的实测计算、云端 ASR 接入与落库。

三个维度都只由可复算的输入推导，不做任何猜测：
- 语速 = 转写字数 / 时长（分钟），单位「字/分」；空文本或缺失时长 -> null。
  有时间戳时，分母用「发声跨度」（首时间单元开始到末时间单元结束）而不是整段
  录音时长，因为录音首尾与中间的大段静音不该拉低真实语速。
- 清晰度 = 可复核的代理指标：口头禅/填充词出现次数 + 停顿次数，
  按文档化阈值折算成 0-100 的 clarity_score 与 good/fair/needs_work 等级；
  没有文本时 -> null。它是代理指标，不是声学信号实测，报告文案必须如实标注。
- 自信度不在这里计算：没有足够信号支撑，报告继续沿用「有依据的估计」措辞。

语音链路有两种：浏览器实时转写（拿不到时间戳）与云端 ASR（Paraformer，尽量带
词/句级时间戳）。来源会写进 timing_source，报告侧据此如实标注，绝不把
「字数 ÷ 录音时长」冒充成时间戳口径。

原始音频不经过本服务：云端路径里音频只以内存字节参与一次 multipart 上传，
处理完即弃、不落盘；落库的只有时长、转写文本与派生指标。
"""

from __future__ import annotations

import base64
import binascii
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.modules.interview import dao as interview_dao
from app.modules.settings import service as settings_service
from app.shared.errors import ModelNotConfigured, ResourceNotFound, ValidationFailed

from . import dashscope_asr, dashscope_tts, dao
from .models import SpeechSegment
from .schemas import (
    MAX_AUDIO_BYTES,
    SpeechExpressionView,
    SpeechSegmentCreate,
    SpeechSegmentView,
    SpeechSynthesisRequest,
    SpeechTranscribeRequest,
    SpeechTranscriptionView,
    SpeechWord,
)

# 口头禅/填充词白名单：中英文各一组。这是可复核的代理口径——命中的都是文本里
# 真实出现的词，不是从声学信号推断的气质。命中次数按词独立统计。
FILLER_WORDS: tuple[str, ...] = (
    "嗯",
    "呃",
    "额",
    "啊",
    "哦",
    "那个",
    "这个",
    "就是",
    "就是说",
    "然后就是",
    "然后呢",
    "怎么说",
    "怎么说呢",
    "对吧",
    "反正",
    "其实吧",
    "um",
    "uh",
    "erm",
    "like",
    "you know",
    "i mean",
    "sort of",
    "kind of",
    "basically",
    "actually",
)

# 只听 CJK 统一表意文字与拉丁/数字字母：标点、空白、emoji 不计入「字数」。
_CHARACTER_RE = re.compile(r"[\u4e00-\u9fffA-Za-z0-9]")

# 停顿阈值（口径常量，改动即视为口径变更）：相邻词/句时间单元的间隔严格大于
# 600ms 记一次停顿。取值与前端 Web Audio 静音检测的 PAUSE_MIN_MS 保持一致。
PAUSE_GAP_MS = 600

# 清晰度折算口径（文档化常量，改动即视为口径变更）：
#   填充词率 = 填充词数 / 字数 * 100（百分比），每 1% 扣 6 分，最多扣 60 分；
#   停顿率 = 停顿次数 / 时长分钟（次/分），每 1 次/分扣 1.2 分，最多扣 40 分。
# 没有停顿测量时不扣停顿分，只按填充词给出清晰度。
CLARITY_FILLER_RATE_WEIGHT = 6.0
CLARITY_FILLER_MAX_PENALTY = 60.0
CLARITY_PAUSE_RATE_WEIGHT = 1.2
CLARITY_PAUSE_MAX_PENALTY = 40.0
CLARITY_GOOD_MIN = 80
CLARITY_FAIR_MIN = 60

MIN_SECONDS = 1e-6

_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")
_EXTENSION_RE = re.compile(r"^[a-z0-9]{1,8}$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return f"spg_{uuid4().hex[:12]}"


def count_characters(text: str) -> int:
    """统计「字数」：CJK 表意文字 + 拉丁字母 + 数字，忽略空白与标点。"""
    return len(_CHARACTER_RE.findall(text or ""))


def count_fillers(text: str) -> int:
    """统计口头禅/填充词出现次数；大小写不敏感，按词独立计数。"""
    lowered = (text or "").lower()
    return sum(lowered.count(word) for word in FILLER_WORDS)


def count_pauses(units: Sequence[SpeechWord]) -> int:
    """时间戳口径的停顿次数：相邻单元间隔严格大于 PAUSE_GAP_MS 的次数。

    少于两个单元时没有可测的「相邻间隔」，返回 0 代表「没有测到停顿」；
    调用方在只有一个单元时会把它当作「无法测量」而不是「零停顿」。
    """
    return sum(1 for previous, current in zip(units, units[1:]) if current.begin_ms - previous.end_ms > PAUSE_GAP_MS)


def speech_span_seconds(units: Sequence[SpeechWord]) -> float | None:
    """发声跨度（秒）：最后一个单元的结束减去第一个单元的开始；不可测时为 None。"""
    if not units:
        return None
    span_ms = max(unit.end_ms for unit in units) - min(unit.begin_ms for unit in units)
    if span_ms <= 0:
        return None
    return round(span_ms / 1000.0, 3)


def compute_pace(char_count: int, duration_seconds: float) -> int | None:
    """语速（字/分）。不可测量时返回 None，而不是 0。"""
    if char_count <= 0 or duration_seconds <= MIN_SECONDS:
        return None
    return round(char_count * 60.0 / duration_seconds)


def compute_clarity(
    char_count: int,
    filler_count: int,
    duration_seconds: float,
    pause_count: int | None,
) -> tuple[int | None, str | None]:
    """由文本代理指标折算 (clarity_score, clarity_level)；无法测量时为 (None, None)。"""
    if char_count <= 0 or duration_seconds <= MIN_SECONDS:
        return None, None
    filler_rate = filler_count / char_count * 100.0
    score = 100.0 - min(filler_rate * CLARITY_FILLER_RATE_WEIGHT, CLARITY_FILLER_MAX_PENALTY)
    if pause_count is not None:
        pause_rate = pause_count / (duration_seconds / 60.0)
        score -= min(pause_rate * CLARITY_PAUSE_RATE_WEIGHT, CLARITY_PAUSE_MAX_PENALTY)
    score = max(0, round(score))
    if score >= CLARITY_GOOD_MIN:
        return score, "good"
    if score >= CLARITY_FAIR_MIN:
        return score, "fair"
    return score, "needs_work"


def _validate_references(db: Session, owner_id: str, session_id: str | None, question_id: str | None) -> None:
    """校验回指的会话/题目属于当前用户，避免把指标挂到别人的会话上。"""
    if session_id is not None:
        session = interview_dao.get_session(db, session_id)
        if session is None or session.owner_id != owner_id:
            raise ResourceNotFound(f"面试会话 {session_id} 不存在")
    if question_id is not None:
        question = interview_dao.get_question(db, question_id)
        if question is None:
            raise ResourceNotFound(f"题目 {question_id} 不存在")
        if session_id is not None and question.session_id != session_id:
            raise ValidationFailed("题目不属于该面试会话")
        if session_id is None:
            session = interview_dao.get_session(db, question.session_id)
            if session is None or session.owner_id != owner_id:
                raise ResourceNotFound(f"题目 {question_id} 不存在")


def _to_view(segment: SpeechSegment) -> SpeechSegmentView:
    return SpeechSegmentView(
        id=segment.id,
        session_id=segment.session_id,
        question_id=segment.question_id,
        duration_seconds=segment.duration_seconds,
        transcript=segment.transcript,
        char_count=segment.char_count,
        pace_chars_per_min=segment.pace_chars_per_min,
        filler_count=segment.filler_count,
        pause_count=segment.pause_count,
        clarity_score=segment.clarity_score,
        clarity_level=segment.clarity_level,  # type: ignore[arg-type]
        provider=segment.provider,
        timing_source=segment.timing_source,  # type: ignore[arg-type]
        speech_duration_seconds=segment.speech_duration_seconds,
        created_at=segment.created_at,
    )


def record_segment(db: Session, owner_id: str, payload: SpeechSegmentCreate) -> SpeechSegmentView:
    """计算并落一条语音指标；所有派生值都来自本次请求的真实时长、文本与时间戳。"""
    _validate_references(db, owner_id, payload.session_id, payload.question_id)

    char_count = count_characters(payload.transcript)
    filler_count = count_fillers(payload.transcript)

    words = list(payload.words or [])
    speech_duration: float | None = None
    timing_source: str | None = None
    if len(words) >= 2:
        # 时间戳口径：停顿按真实间隔算；语速分母优先用发声跨度。
        pause_count = count_pauses(words)
        speech_duration = speech_span_seconds(words)
        if speech_duration is not None:
            timing_source = "timestamps"
    else:
        # 没有可用的词/句级时间戳：沿用浏览器静音检测的停顿，语速退回字数÷时长。
        pause_count = payload.pause_count

    pace = compute_pace(char_count, speech_duration if speech_duration is not None else payload.duration_seconds)
    if timing_source is None and pace is not None:
        timing_source = "duration"
    clarity_score, clarity_level = compute_clarity(
        char_count, filler_count, payload.duration_seconds, pause_count
    )

    segment = SpeechSegment(
        id=_new_id(),
        owner_id=owner_id,
        session_id=payload.session_id,
        question_id=payload.question_id,
        duration_seconds=payload.duration_seconds,
        transcript=payload.transcript,
        char_count=char_count,
        pace_chars_per_min=pace,
        filler_count=filler_count,
        pause_count=pause_count,
        clarity_score=clarity_score,
        clarity_level=clarity_level,
        provider=payload.provider,
        timing_source=timing_source,
        speech_duration_seconds=speech_duration,
        created_at=_now(),
    )
    dao.add_segment(db, segment)
    db.commit()
    db.refresh(segment)
    return _to_view(segment)


def list_segments(db: Session, owner_id: str, session_id: str) -> list[SpeechSegmentView]:
    return [_to_view(segment) for segment in dao.list_segments_for_session(db, owner_id, session_id)]


def decode_audio(audio_base64: str) -> bytes:
    """把 base64 音频解码到内存；不合法或超限时给可区分的 422，不落盘。"""
    try:
        raw = base64.b64decode(audio_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValidationFailed("音频数据不是合法的 base64") from exc
    if not raw:
        raise ValidationFailed("音频数据为空")
    if len(raw) > MAX_AUDIO_BYTES:
        raise ValidationFailed(f"音频过大：单次上传不超过 {MAX_AUDIO_BYTES // (1024 * 1024)} MB")
    return raw


def _safe_filename(filename: str | None, content_type: str | None) -> str:
    """只保留安全字符，避免把路径或奇怪字符拼进 DashScope 的 OSS object key。"""
    candidate = _SAFE_FILENAME_RE.sub("_", Path(filename or "").name).strip("._")[:80]
    if candidate:
        return candidate
    extension = "webm"
    if content_type:
        subtype = content_type.split("/")[-1].split(";")[0].strip().lower()
        if _EXTENSION_RE.fullmatch(subtype):
            extension = subtype
    return f"answer.{extension}"


def transcribe_answer(db: Session, user: CurrentUser, payload: SpeechTranscribeRequest) -> SpeechTranscriptionView:
    """调用云端 Paraformer 转写一段录音，返回转写与（尽量有的）时间戳。

    未配置 API Key 时抛 MODEL_NOT_CONFIGURED；上游拒绝/超时/畸形响应分别映射成
    UPSTREAM_REJECTED / UPSTREAM_TIMEOUT / MODEL_OUTPUT_INVALID，均不含上游原文。
    音频只存在于内存：解码后直接作为 multipart 请求体交给 DashScope，处理完即弃。
    """
    credentials = settings_service.get_speech_credentials(db, user)
    audio = decode_audio(payload.audio_base64)
    result = dashscope_asr.transcribe_audio(
        audio=audio,
        api_key=credentials.api_key,
        model=credentials.model,
        base_url=dashscope_asr.resolve_base_url(region=credentials.region, endpoint=credentials.endpoint),
        filename=_safe_filename(payload.filename, payload.content_type),
        content_type=payload.content_type or "audio/webm",
        language_hints=payload.language_hints,
    )
    return SpeechTranscriptionView(
        transcript=result.transcript,
        duration_seconds=result.duration_seconds,
        words=[
            SpeechWord(text=unit.text, begin_ms=unit.begin_ms, end_ms=unit.end_ms)
            for unit in result.words
        ]
        or None,
        provider=result.provider,
    )



def synthesize_speech(db: Session, user: CurrentUser, payload: SpeechSynthesisRequest) -> dashscope_tts.SynthesizedAudio:
    """用语音配置里的同一把 Key 调云端 TTS，并在服务端取回音频字节。

    未配置 Key 时给可区分的 MODEL_NOT_CONFIGURED（文案改成播报口径）；上游拒绝/超时/
    畸形响应分别映射成 UPSTREAM_REJECTED / UPSTREAM_TIMEOUT / MODEL_OUTPUT_INVALID。
    临时音频 URL 不返回给前端，服务端取回后只回音频字节。
    """
    try:
        credentials = settings_service.get_speech_credentials(db, user)
    except ModelNotConfigured as exc:
        raise ModelNotConfigured("还没有配置语音服务 API Key，请到设置里配置后再使用云端播报") from exc
    return dashscope_tts.synthesize(
        text=payload.text,
        voice=payload.voice or dashscope_tts.DEFAULT_VOICE,
        model=dashscope_tts.DEFAULT_MODEL,
        api_key=credentials.api_key,
        base_url=dashscope_asr.resolve_base_url(region=credentials.region, endpoint=credentials.endpoint),
    )


def summarize_segments(segments: Sequence[SpeechSegment]) -> SpeechExpressionView:
    """把同一会话的多段真实录音指标汇总成表达维度；口径与前端 summarizeExpression 一致。

    语速 = 总字数 / 总发声跨度（无时间戳时退回总录音时长）；清晰度按有分数段的时长
    加权平均后落档；没有音频时全部为不可测量，绝不用 0 冒充。
    """
    if not segments:
        return SpeechExpressionView(
            has_audio=False,
            segment_count=0,
            duration_seconds=0.0,
            char_count=0,
            filler_count=0,
        )

    char_count = sum(segment.char_count for segment in segments)
    duration_seconds = sum(segment.duration_seconds for segment in segments)
    filler_count = sum(segment.filler_count for segment in segments)
    effective_duration = sum(
        segment.speech_duration_seconds
        if segment.speech_duration_seconds is not None
        else segment.duration_seconds
        for segment in segments
    )
    pace = compute_pace(char_count, effective_duration)

    sources = {
        segment.timing_source
        for segment in segments
        if segment.timing_source in ("timestamps", "duration")
    }
    if not sources:
        timing_source: str | None = None
    elif len(sources) == 1:
        timing_source = next(iter(sources))
    else:
        timing_source = "mixed"

    scored = [segment for segment in segments if segment.clarity_score is not None]
    scored_duration = sum(segment.duration_seconds for segment in scored)
    clarity_score: int | None = None
    if scored and scored_duration > 0:
        clarity_score = round(
            sum((segment.clarity_score or 0) * segment.duration_seconds for segment in scored) / scored_duration
        )
    elif scored:
        clarity_score = round(sum(segment.clarity_score or 0 for segment in scored) / len(scored))

    clarity_level: str | None = None
    if clarity_score is not None:
        if clarity_score >= CLARITY_GOOD_MIN:
            clarity_level = "good"
        elif clarity_score >= CLARITY_FAIR_MIN:
            clarity_level = "fair"
        else:
            clarity_level = "needs_work"

    pause_values = [segment.pause_count for segment in segments if segment.pause_count is not None]
    return SpeechExpressionView(
        has_audio=True,
        segment_count=len(segments),
        duration_seconds=round(duration_seconds, 3),
        char_count=char_count,
        pace_chars_per_min=pace,
        clarity_level=clarity_level,  # type: ignore[arg-type]
        clarity_score=clarity_score,
        filler_count=filler_count,
        pause_count=sum(pause_values) if pause_values else None,
        timing_source=timing_source,  # type: ignore[arg-type]
    )


def summarize_session_expression(db: Session, owner_id: str, session_id: str) -> SpeechExpressionView:
    """按属主 + 会话读回语音指标并汇总；没有录音时返回 has_audio=false。"""
    return summarize_segments(dao.list_segments_for_session(db, owner_id, session_id))
