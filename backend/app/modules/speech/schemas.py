from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from app.shared.schemas import ApiModel

# 清晰度等级：good / fair / needs_work；无法计算时不落任何等级。
ClarityLevel = Literal["good", "fair", "needs_work"]
# 语速/停顿的口径来源：timestamps（词/句级时间戳）或 duration（字数 ÷ 录音时长）。
TimingSource = Literal["timestamps", "duration"]

MAX_TRANSCRIPT_CHARS = 20000
MAX_DURATION_SECONDS = 7200.0
# 云端 ASR 单次上传上限：面试单题作答足够，且让 base64 请求体保持在可用范围。
MAX_AUDIO_BYTES = 10 * 1024 * 1024
# base64 编码后长度上界（含 padding），用于请求体字段的长度校验。
MAX_AUDIO_BASE64_CHARS = ((MAX_AUDIO_BYTES + 2) // 3) * 4
MAX_TIMED_UNITS = 20000


class SpeechWord(ApiModel):
    """一个词级/句级时间戳单元；begin/end 相对音频开头，单位毫秒。

    上游只给句级时间戳时这里装的是句子；给词级时间戳时装的是词。停顿按相邻
    单元之间的空隙统计，两种粒度都能用。
    """

    text: str = Field(min_length=1, max_length=200)
    begin_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)

    @model_validator(mode="after")
    def _ordered(self) -> "SpeechWord":
        if self.end_ms < self.begin_ms:
            raise ValueError("endMs 不能早于 beginMs")
        return self


class SpeechTranscribeRequest(ApiModel):
    """POST /speech/transcribe：把浏览器录音交给云端 ASR。

    音频走 base64 JSON，而不是 multipart：仓库当前没有 python-multipart 依赖，
    单题作答音频通常在几 MB 内；base64 让请求体与既有 JSON 契约统一，前端只需
    btoa(blob)，同时后端可以把音频完全留在内存里交给 DashScope，不落任何临时文件。
    """

    audio_base64: str = Field(min_length=1, max_length=MAX_AUDIO_BASE64_CHARS)
    content_type: str | None = Field(default=None, max_length=100)
    filename: str | None = Field(default=None, max_length=200)
    # 语种提示，如 ["zh", "en"]；仅 DashScope paraformer-v2 支持。
    language_hints: list[str] | None = Field(default=None, max_length=4)


class SpeechTranscriptionView(ApiModel):
    """云端 ASR 结果：转写、总时长、可选的词/句级时间戳与服务商。"""

    transcript: str
    duration_seconds: float
    words: list[SpeechWord] | None = None
    provider: str


class SpeechSegmentCreate(ApiModel):
    """POST /speech/segments：一段真实录音作答的时长与转写。

    durationSeconds 由前端 MediaRecorder 计时得出，必须 > 0：没有真实音频就没有
    可复算的语速，0 秒会被 422 拒绝而不是伪造一个 0 字/分。
    transcript 允许为空（录音成功但转写为空），此时语速与清晰度都为 null。
    pauseCount 为浏览器 Web Audio 静音检测到的停顿次数，可选、未测到就不传。
    words 为云端 ASR 返回的词/句级时间戳；给了它，服务端就用真实时间戳重算语速
    （发声跨度）与停顿（相邻单元间隔 > 阈值），并在 timingSource 里如实标注来源。
    provider 记录这次转写的服务商（如 dashscope）；浏览器转写/手动输入不传。
    """

    duration_seconds: float = Field(gt=0, le=MAX_DURATION_SECONDS)
    transcript: str = Field(default="", max_length=MAX_TRANSCRIPT_CHARS)
    session_id: str | None = Field(default=None, max_length=64)
    question_id: str | None = Field(default=None, max_length=64)
    pause_count: int | None = Field(default=None, ge=0, le=2000)
    words: list[SpeechWord] | None = Field(default=None, max_length=MAX_TIMED_UNITS)
    provider: str | None = Field(default=None, max_length=32)

    @field_validator("transcript")
    @classmethod
    def _trim_transcript(cls, value: str) -> str:
        return value.strip()

    @field_validator("session_id", "question_id")
    @classmethod
    def _blank_ids_become_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


# TTS 合成文本上限（字符）：与 dashscope_tts.MAX_TEXT_CHARS 保持一致，超限直接 422，
# 不静默截断题干。
MAX_SPEECH_SYNTHESIS_CHARS = 2000


class SpeechSynthesisRequest(ApiModel):
    """POST /speech/synthesize：把题干文本合成成可播放音频。

    voice 为空时由服务端回落到默认音色；format 目前只支持 wav（qwen3-tts-flash
    只产出 wav 临时链接），传其它值会被 422 拒绝而不是假装支持。
    """

    text: str = Field(min_length=1, max_length=MAX_SPEECH_SYNTHESIS_CHARS)
    voice: str | None = Field(default=None, max_length=64)
    format: Literal["wav"] | None = None

    @field_validator("text")
    @classmethod
    def _trim_text(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("合成文本不能为空")
        return trimmed

    @field_validator("voice")
    @classmethod
    def _blank_voice_becomes_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class SpeechExpressionView(ApiModel):
    """本场语音指标汇总：表达维度由真实录音派生，缺音频时全部为「不可测量」。"""

    has_audio: bool
    segment_count: int
    duration_seconds: float
    char_count: int
    pace_chars_per_min: int | None = None
    clarity_level: ClarityLevel | None = None
    clarity_score: int | None = None
    filler_count: int = 0
    pause_count: int | None = None
    timing_source: Literal["timestamps", "duration", "mixed"] | None = None


class SpeechSegmentView(ApiModel):
    """一段语音作答指标的对外视图；指标为 null 表示该指标无法测量。"""

    id: str
    session_id: str | None = None
    question_id: str | None = None
    duration_seconds: float
    transcript: str
    char_count: int
    pace_chars_per_min: int | None = None
    filler_count: int
    pause_count: int | None = None
    clarity_score: int | None = None
    clarity_level: ClarityLevel | None = None
    provider: str | None = None
    timing_source: TimingSource | None = None
    speech_duration_seconds: float | None = None
    created_at: datetime
