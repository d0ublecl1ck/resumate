"""create speech segments

语音链路真实化（Issue b404e）：落一段作答的真实时长、转写与派生指标。
只新增一张表，不修改任何既有表语义；指标为 NULL 表示无法测量，而不是 0。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4fd011c03ba5'
down_revision: Union[str, Sequence[str], None] = 'a3c5e7f9b1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'speech_segments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('session_id', sa.String(length=36), nullable=True),
        sa.Column('question_id', sa.String(length=36), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=False),
        sa.Column('transcript', sa.Text(), nullable=False),
        sa.Column('char_count', sa.Integer(), nullable=False),
        sa.Column('pace_chars_per_min', sa.Integer(), nullable=True),
        sa.Column('filler_count', sa.Integer(), nullable=False),
        sa.Column('pause_count', sa.Integer(), nullable=True),
        sa.Column('clarity_score', sa.Integer(), nullable=True),
        sa.Column('clarity_level', sa.String(length=16), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_speech_segments_owner_id', 'speech_segments', ['owner_id'])
    op.create_index('ix_speech_segments_session_id', 'speech_segments', ['session_id'])
    op.create_index('ix_speech_segments_question_id', 'speech_segments', ['question_id'])


def downgrade() -> None:
    op.drop_index('ix_speech_segments_question_id', table_name='speech_segments')
    op.drop_index('ix_speech_segments_session_id', table_name='speech_segments')
    op.drop_index('ix_speech_segments_owner_id', table_name='speech_segments')
    op.drop_table('speech_segments')
