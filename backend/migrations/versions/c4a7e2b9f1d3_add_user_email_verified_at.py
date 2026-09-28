"""add user email verified at"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4a7e2b9f1d3'
down_revision: Union[str, Sequence[str], None] = 'b8e4d2f6a1c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True))
    # Accounts created before email verification are trusted. Leaving them NULL
    # would lock every existing user out of login right after the deploy.
    op.execute("UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL")


def downgrade() -> None:
    op.drop_column('users', 'email_verified_at')
