"""add agent scope and profile target

Generalizes the agent operation layer from resume-only to resume|profile:

- agent_turns.resume_id becomes nullable and gains scope (default 'resume');
- agent_pending_actions.resume_id becomes nullable and gains target (default 'resume').

Existing rows keep their resume binding, and the server defaults keep old inserts
valid. Nullability is changed through batch mode so SQLite (used by the migration
regression test) also works.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3a1c7d9b2f4'
down_revision: Union[str, Sequence[str], None] = 'a4d8e2f6c1b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('agent_turns') as batch:
        batch.alter_column('resume_id', existing_type=sa.String(length=36), nullable=True)
        batch.add_column(sa.Column('scope', sa.String(length=16), nullable=False, server_default='resume'))
    with op.batch_alter_table('agent_pending_actions') as batch:
        batch.alter_column('resume_id', existing_type=sa.String(length=36), nullable=True)
        batch.add_column(sa.Column('target', sa.String(length=16), nullable=False, server_default='resume'))


def downgrade() -> None:
    # Narrowing resume_id back to NOT NULL requires that no profile-scoped rows
    # remain; the migration regression test downgrades an empty database.
    with op.batch_alter_table('agent_pending_actions') as batch:
        batch.drop_column('target')
        batch.alter_column('resume_id', existing_type=sa.String(length=36), nullable=False)
    with op.batch_alter_table('agent_turns') as batch:
        batch.drop_column('scope')
        batch.alter_column('resume_id', existing_type=sa.String(length=36), nullable=False)
