"""add resume version traceability columns

Records the client, conversation, user turn, agent run and execution mode that
produced each resume version (contract section 14 / C-03). agent finalize fills
client_id / user_turn_id / execution_mode; manual PUT document leaves them null.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b8e4d2f6a1c9'
down_revision: Union[str, Sequence[str], None] = 'f7b1c3e5a9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('resume_versions', sa.Column('client_id', sa.String(length=64), nullable=True))
    op.add_column('resume_versions', sa.Column('conversation_id', sa.String(length=64), nullable=True))
    op.add_column('resume_versions', sa.Column('user_turn_id', sa.String(length=36), nullable=True))
    op.add_column('resume_versions', sa.Column('agent_run_id', sa.String(length=64), nullable=True))
    op.add_column('resume_versions', sa.Column('execution_mode', sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column('resume_versions', 'execution_mode')
    op.drop_column('resume_versions', 'agent_run_id')
    op.drop_column('resume_versions', 'user_turn_id')
    op.drop_column('resume_versions', 'conversation_id')
    op.drop_column('resume_versions', 'client_id')
