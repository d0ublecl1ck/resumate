"""drop permissions.is_system

Permission codes are owned by the code catalogue (require_permission validates
them at import time), so they are read-only and carry no system/custom split.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd1e5f9a3b7c2'
down_revision: Union[str, Sequence[str], None] = 'c9d4e8f1a2b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('permissions', 'is_system')


def downgrade() -> None:
    op.add_column(
        'permissions',
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
