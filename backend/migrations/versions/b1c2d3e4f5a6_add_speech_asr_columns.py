"""add speech asr columns

云端 ASR 接入（语音链路真实化）：
- speech_segments 增加 provider / timing_source / speech_duration_seconds，用来如实
  标注语速与停顿来自时间戳还是「字数 ÷ 时长」；
- user_settings 增加 speech_config，存语音识别（DashScope Paraformer）配置，
  其中 apiKey 以 Fernet 密文存放，读取接口只回 key_configured 布尔。

只新增列，不改既有列语义；老行 speech_config 默认空对象，timing_source 等为 NULL，
表示「无时间戳口径」，与既有行为一致。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, Sequence[str], None] = 'a3f6c9e2d5b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('speech_segments', sa.Column('provider', sa.String(length=32), nullable=True))
    op.add_column('speech_segments', sa.Column('timing_source', sa.String(length=16), nullable=True))
    op.add_column('speech_segments', sa.Column('speech_duration_seconds', sa.Float(), nullable=True))
    op.add_column(
        'user_settings',
        sa.Column('speech_config', sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )


def downgrade() -> None:
    op.drop_column('user_settings', 'speech_config')
    op.drop_column('speech_segments', 'speech_duration_seconds')
    op.drop_column('speech_segments', 'timing_source')
    op.drop_column('speech_segments', 'provider')
