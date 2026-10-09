"""create quiz tables

岗位笔试（issue 40db8）：quiz_attempts 冻结题目快照与客观题答案键，
quiz_answers 保存作答与判分结果，(question_id, idempotency_key) 唯一保证重复提交幂等。
只新增两张表，不修改任何既有表语义。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f6c9e2d5b8'
down_revision: Union[str, Sequence[str], None] = '4fd011c03ba5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'quiz_attempts',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=200), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('question_types', sa.JSON(), nullable=False),
        sa.Column('questions_snapshot', sa.JSON(), nullable=False),
        sa.Column('max_score', sa.Integer(), nullable=False),
        sa.Column('total_score', sa.Integer(), nullable=True),
        sa.Column('policy', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_quiz_attempts_owner_id', 'quiz_attempts', ['owner_id'])
    op.create_index('ix_quiz_attempts_role', 'quiz_attempts', ['role'])

    op.create_table(
        'quiz_answers',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('attempt_id', sa.String(length=36), nullable=False),
        sa.Column('question_id', sa.String(length=36), nullable=False),
        sa.Column('question_group', sa.String(length=32), nullable=False),
        sa.Column('question_kind', sa.String(length=32), nullable=False),
        sa.Column('idempotency_key', sa.String(length=128), nullable=False),
        sa.Column('answer_payload', sa.JSON(), nullable=False),
        sa.Column('awarded_points', sa.Integer(), nullable=True),
        sa.Column('max_points', sa.Integer(), nullable=False),
        sa.Column('verdict', sa.String(length=32), nullable=False),
        sa.Column('feedback', sa.JSON(), nullable=False),
        sa.Column('executed', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('graded_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'question_id',
            'idempotency_key',
            name='uq_quiz_answers_question_idempotency',
        ),
    )
    op.create_index('ix_quiz_answers_attempt_id', 'quiz_answers', ['attempt_id'])
    op.create_index('ix_quiz_answers_question_id', 'quiz_answers', ['question_id'])


def downgrade() -> None:
    op.drop_index('ix_quiz_answers_question_id', table_name='quiz_answers')
    op.drop_index('ix_quiz_answers_attempt_id', table_name='quiz_answers')
    op.drop_table('quiz_answers')
    op.drop_index('ix_quiz_attempts_role', table_name='quiz_attempts')
    op.drop_index('ix_quiz_attempts_owner_id', table_name='quiz_attempts')
    op.drop_table('quiz_attempts')
