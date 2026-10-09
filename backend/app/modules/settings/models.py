from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class UserSettings(Base):
    """Per-user settings aggregate: preferences, agent policy and model config.

    The three JSON columns keep the settings surface cohesive without a wide,
    mostly-null table; each is written as a whole object by the service layer.
    model_config may hold the provider API key, which is never serialized back
    to clients.
    """

    __tablename__ = "user_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    preferences: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    agent_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    model_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # 语音识别（云端 ASR）配置单独一列，与模型配置同构：provider/region/endpoint/
    # model 明文，apiKey 以 Fernet 密文存放，读取接口只回 keyConfigured 布尔。
    speech_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
