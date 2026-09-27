"""create agent operation layer

Adds the agent_turns / agent_pending_actions / agent_operations tables and the
resume working-copy columns that stage per-turn patches before aggregation
(C-01 / C-03 / C-04).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f7b1c3e5a9d2'
down_revision: Union[str, Sequence[str], None] = 'd1e5f9a3b7c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('resumes', sa.Column('working_document', sa.JSON(), nullable=True))
    op.add_column('resumes', sa.Column('working_base_version_id', sa.String(length=36), nullable=True))
    op.add_column('resumes', sa.Column('working_turn_id', sa.String(length=36), nullable=True))
    op.add_column(
        'resumes',
        sa.Column('working_revision', sa.Integer(), nullable=False, server_default='0'),
    )

    op.create_table(
        'agent_turns',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('resume_id', sa.String(length=36), nullable=False),
        sa.Column('client_id', sa.String(length=64), nullable=False),
        sa.Column('source', sa.String(length=32), nullable=False),
        sa.Column('execution_mode', sa.String(length=32), nullable=False),
        sa.Column('mode_source', sa.String(length=32), nullable=False),
        sa.Column('state', sa.String(length=32), nullable=False),
        sa.Column('base_version_id', sa.String(length=36), nullable=True),
        sa.Column('message', sa.String(length=1000), nullable=False),
        sa.Column('result_state', sa.String(length=32), nullable=True),
        sa.Column('result_version_id', sa.String(length=36), nullable=True),
        sa.Column('result_change_count', sa.Integer(), nullable=True),
        sa.Column('result_affected_sections', sa.JSON(), nullable=True),
        sa.Column('result_message', sa.String(length=500), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_agent_turns_owner_id'), 'agent_turns', ['owner_id'], unique=False)
    op.create_index(op.f('ix_agent_turns_resume_id'), 'agent_turns', ['resume_id'], unique=False)

    op.create_table(
        'agent_pending_actions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('turn_id', sa.String(length=36), nullable=False),
        sa.Column('resume_id', sa.String(length=36), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('base_version_id', sa.String(length=36), nullable=True),
        sa.Column('impact_summary', sa.String(length=500), nullable=False),
        sa.Column('requires_text_confirm', sa.Boolean(), nullable=False),
        sa.Column('state', sa.String(length=32), nullable=False),
        sa.Column('stale_reason', sa.String(length=200), nullable=True),
        sa.Column('ops', sa.JSON(), nullable=False),
        sa.Column('reason', sa.String(length=500), nullable=False),
        sa.Column('diff', sa.JSON(), nullable=False),
        sa.Column('change_count', sa.Integer(), nullable=False),
        sa.Column('affected_sections', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_agent_pending_actions_owner_id'), 'agent_pending_actions', ['owner_id'], unique=False
    )
    op.create_index(
        op.f('ix_agent_pending_actions_turn_id'), 'agent_pending_actions', ['turn_id'], unique=False
    )

    op.create_table(
        'agent_operations',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('turn_id', sa.String(length=36), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('idempotency_key', sa.String(length=200), nullable=False),
        sa.Column('request_hash', sa.String(length=64), nullable=False),
        sa.Column('response', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('turn_id', 'kind', 'idempotency_key', name='uq_agent_operation_key'),
    )
    op.create_index(op.f('ix_agent_operations_owner_id'), 'agent_operations', ['owner_id'], unique=False)
    op.create_index(op.f('ix_agent_operations_turn_id'), 'agent_operations', ['turn_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_agent_operations_turn_id'), table_name='agent_operations')
    op.drop_index(op.f('ix_agent_operations_owner_id'), table_name='agent_operations')
    op.drop_table('agent_operations')
    op.drop_index(op.f('ix_agent_pending_actions_turn_id'), table_name='agent_pending_actions')
    op.drop_index(op.f('ix_agent_pending_actions_owner_id'), table_name='agent_pending_actions')
    op.drop_table('agent_pending_actions')
    op.drop_index(op.f('ix_agent_turns_resume_id'), table_name='agent_turns')
    op.drop_index(op.f('ix_agent_turns_owner_id'), table_name='agent_turns')
    op.drop_table('agent_turns')
    op.drop_column('resumes', 'working_revision')
    op.drop_column('resumes', 'working_turn_id')
    op.drop_column('resumes', 'working_base_version_id')
    op.drop_column('resumes', 'working_document')
