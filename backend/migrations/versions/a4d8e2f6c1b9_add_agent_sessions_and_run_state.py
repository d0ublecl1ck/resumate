"""add agent sessions and run state

Creates agent_sessions / agent_session_messages and extends agent_turns with an
optional session_id plus the per-turn run checkpoint (run_state / state_version).
Existing turns keep working: the new columns are nullable or carry a server
default.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a4d8e2f6c1b9'
down_revision: Union[str, Sequence[str], None] = 'c4a7e2b9f1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('agent_turns', sa.Column('session_id', sa.String(length=36), nullable=True))
    op.add_column(
        'agent_turns',
        sa.Column('run_state', sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        'agent_turns',
        sa.Column('state_version', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index(op.f('ix_agent_turns_session_id'), 'agent_turns', ['session_id'], unique=False)

    op.create_table(
        'agent_sessions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('owner_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_active_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_agent_sessions_owner_id'), 'agent_sessions', ['owner_id'], unique=False)

    op.create_table(
        'agent_session_messages',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('session_id', sa.String(length=36), nullable=False),
        sa.Column('seq', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=16), nullable=False),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('session_id', 'seq', name='uq_agent_session_message_seq'),
    )
    op.create_index(
        op.f('ix_agent_session_messages_session_id'),
        'agent_session_messages',
        ['session_id'],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_agent_session_messages_session_id'), table_name='agent_session_messages')
    op.drop_table('agent_session_messages')
    op.drop_index(op.f('ix_agent_sessions_owner_id'), table_name='agent_sessions')
    op.drop_table('agent_sessions')
    op.drop_index(op.f('ix_agent_turns_session_id'), table_name='agent_turns')
    op.drop_column('agent_turns', 'state_version')
    op.drop_column('agent_turns', 'run_state')
    op.drop_column('agent_turns', 'session_id')
