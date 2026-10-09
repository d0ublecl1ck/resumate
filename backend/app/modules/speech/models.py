from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SpeechSegment(Base):
    """一段语音作答的实测指标。

    只保存可复算的输入与派生结果：时长秒、转写文本、字数、语速、填充词数、
    停顿次数、清晰度分与等级。原始音频不上传、不落库——即使是云端 ASR 路径，
    音频也只以内存字节参与一次 multipart 上传，处理完即弃。
    session_id / question_id 是可选的会话与题目回指；没有真实录音就不会有行，
    报告侧据此显示「不适用」，而不是写死数字。
    """

    __tablename__ = "speech_segments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    question_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    transcript: Mapped[str] = mapped_column(Text, nullable=False, default="")
    char_count: Mapped[int] = mapped_column(Integer, nullable=False)
    # 语速 = 字数 / 时长（分钟），单位「字/分」；无法计算时为 NULL，绝不落 0。
    pace_chars_per_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    filler_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 由浏览器端 Web Audio 静音检测或 ASR 时间戳间隔得到的停顿次数；未测到时为 NULL。
    pause_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clarity_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # good / fair / needs_work；无法计算时为 NULL。
    clarity_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 识别服务商（如 dashscope）；浏览器实时转写或手动输入时为 NULL。
    provider: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 语速/停顿的口径来源："timestamps" = 词/句级时间戳，"duration" = 字数 ÷ 录音时长。
    # 拿不到时间戳时如实标注成 duration，不假装是时间戳算出来的。
    timing_source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # 时间戳口径下用于算语速的「发声跨度」：首个时间单元开始到最后一个结束（秒）。
    # 无时间戳时为 NULL，语速退回 duration_seconds。
    speech_duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
