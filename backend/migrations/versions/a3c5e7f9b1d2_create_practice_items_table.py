"""create practice items table

面试数据聚合（Issue ed1b9）：把评估报告的建议落成可执行、可复测的练习项。
(source_report_id, dimension) 唯一保证重复 materialize 幂等；只新增一张表，
不修改任何既有表语义。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3c5e7f9b1d2'
down_revision: Union[str, Sequence[str], None] = 'e6b2f8a4c7d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'practice_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=200), nullable=False),
        sa.Column('dimension', sa.String(length=32), nullable=False),
        sa.Column('goal', sa.Text(), nullable=False),
        sa.Column('material', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False),
        sa.Column('source_report_id', sa.String(length=36), nullable=False),
        sa.Column('source_session_id', sa.String(length=36), nullable=False),
        sa.Column('rubric_version', sa.String(length=64), nullable=False),
        sa.Column('retest_session_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('source_report_id', 'dimension', name='uq_practice_items_report_dimension'),
    )
    op.create_index('ix_practice_items_owner_id', 'practice_items', ['owner_id'])
    op.create_index('ix_practice_items_role', 'practice_items', ['role'])
    op.create_index('ix_practice_items_source_report_id', 'practice_items', ['source_report_id'])
    op.create_index('ix_practice_items_source_session_id', 'practice_items', ['source_session_id'])


def downgrade() -> None:
    op.drop_index('ix_practice_items_source_session_id', table_name='practice_items')
    op.drop_index('ix_practice_items_source_report_id', table_name='practice_items')
    op.drop_index('ix_practice_items_role', table_name='practice_items')
    op.drop_index('ix_practice_items_owner_id', table_name='practice_items')
    op.drop_table('practice_items')
