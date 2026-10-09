"""create interview tables

基于 JD 的 AI 模拟面试（赛题 A11）：会话冻结上下文快照、题目（含追问）、
幂等作答、结构化评估报告。只新增四张表，不修改任何既有表语义。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8f1d3a6e2b4'
down_revision: Union[str, Sequence[str], None] = 'b3d8e1f4a6c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'interview_sessions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('resume_id', sa.String(length=36), nullable=False),
        sa.Column('resume_version_id', sa.String(length=36), nullable=False),
        sa.Column('jd_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=200), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('rubric_version', sa.String(length=64), nullable=False),
        sa.Column('context_snapshot', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_interview_sessions_owner_id', 'interview_sessions', ['owner_id'])
    op.create_index('ix_interview_sessions_resume_id', 'interview_sessions', ['resume_id'])
    op.create_index('ix_interview_sessions_jd_id', 'interview_sessions', ['jd_id'])

    op.create_table(
        'interview_questions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('session_id', sa.String(length=36), nullable=False),
        sa.Column('ordinal', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('reference_points', sa.JSON(), nullable=False),
        sa.Column('parent_question_id', sa.String(length=36), nullable=True),
        sa.Column('derived_from_answer_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_interview_questions_session_id', 'interview_questions', ['session_id'])

    op.create_table(
        'interview_answers',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('session_id', sa.String(length=36), nullable=False),
        sa.Column('question_id', sa.String(length=36), nullable=False),
        sa.Column('idempotency_key', sa.String(length=128), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('question_id', 'idempotency_key', name='uq_interview_answers_question_idempotency'),
    )
    op.create_index('ix_interview_answers_session_id', 'interview_answers', ['session_id'])
    op.create_index('ix_interview_answers_question_id', 'interview_answers', ['question_id'])

    op.create_table(
        'interview_reports',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('session_id', sa.String(length=36), nullable=False),
        sa.Column('rubric_version', sa.String(length=64), nullable=False),
        sa.Column('content_scores', sa.JSON(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.Column('highlights', sa.JSON(), nullable=False),
        sa.Column('gaps', sa.JSON(), nullable=False),
        sa.Column('suggestions', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', name='uq_interview_reports_session_id'),
    )


def downgrade() -> None:
    op.drop_table('interview_reports')
    op.drop_index('ix_interview_answers_question_id', table_name='interview_answers')
    op.drop_index('ix_interview_answers_session_id', table_name='interview_answers')
    op.drop_table('interview_answers')
    op.drop_index('ix_interview_questions_session_id', table_name='interview_questions')
    op.drop_table('interview_questions')
    op.drop_index('ix_interview_sessions_jd_id', table_name='interview_sessions')
    op.drop_index('ix_interview_sessions_resume_id', table_name='interview_sessions')
    op.drop_index('ix_interview_sessions_owner_id', table_name='interview_sessions')
    op.drop_table('interview_sessions')
