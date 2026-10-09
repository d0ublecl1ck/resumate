"""create kb documents and chunks tables

知识库检索链路（Issue acf2f）：kb_documents 存导入文档原文与 role 归属，
kb_chunks 存服务端切片结果（标题 + 正文 + 序号）。只新增两张表与其索引，
不修改任何既有表语义。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e6b2f8a4c7d1'
down_revision: Union[str, Sequence[str], None] = 'd5a9c3f7b1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'kb_documents',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('role', sa.String(length=200), nullable=False),
        sa.Column('source_type', sa.String(length=16), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('chunk_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_kb_documents_role', 'kb_documents', ['role'])

    op.create_table(
        'kb_chunks',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('document_id', sa.String(length=36), nullable=False),
        sa.Column('ordinal', sa.Integer(), nullable=False),
        sa.Column('heading', sa.String(length=200), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('char_count', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_kb_chunks_document_id', 'kb_chunks', ['document_id'])


def downgrade() -> None:
    op.drop_index('ix_kb_chunks_document_id', table_name='kb_chunks')
    op.drop_table('kb_chunks')
    op.drop_index('ix_kb_documents_role', table_name='kb_documents')
    op.drop_table('kb_documents')
