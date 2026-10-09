"""create bank questions table

岗位题库（赛题 A11）：一道题归属一个岗位与一种题型/难度，(role, prompt_hash)
唯一约束保证同一岗位内题干不重复。只新增一张表，不修改任何既有表语义。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5a9c3f7b1e2'
down_revision: Union[str, Sequence[str], None] = 'c8f1d3a6e2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'bank_questions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=200), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('difficulty', sa.String(length=16), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('reference_points', sa.JSON(), nullable=False),
        sa.Column('knowledge_refs', sa.JSON(), nullable=True),
        sa.Column('source', sa.String(length=32), nullable=False),
        sa.Column('batch_id', sa.String(length=64), nullable=False),
        sa.Column('prompt_hash', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('role', 'prompt_hash', name='uq_bank_questions_role_prompt_hash'),
    )
    op.create_index('ix_bank_questions_role', 'bank_questions', ['role'])
    op.create_index('ix_bank_questions_kind', 'bank_questions', ['kind'])
    op.create_index('ix_bank_questions_difficulty', 'bank_questions', ['difficulty'])


def downgrade() -> None:
    op.drop_index('ix_bank_questions_difficulty', table_name='bank_questions')
    op.drop_index('ix_bank_questions_kind', table_name='bank_questions')
    op.drop_index('ix_bank_questions_role', table_name='bank_questions')
    op.drop_table('bank_questions')
