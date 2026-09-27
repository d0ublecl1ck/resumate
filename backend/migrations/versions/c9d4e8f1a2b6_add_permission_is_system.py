"""add permissions.is_system"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9d4e8f1a2b6'
down_revision: Union[str, Sequence[str], None] = 'e2f7a4c8b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'permissions',
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column('permissions', 'is_system')
