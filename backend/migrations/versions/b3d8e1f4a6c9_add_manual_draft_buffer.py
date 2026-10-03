"""add manual draft buffer

Adds the manual-edit draft buffer columns on resumes (C-05): the idle autosave
stages content here without creating a version, so the committed document and
its version history stay untouched until the user (or the idle timer) flushes.
Kept separate from the agent working-copy columns, which hold their own baseline.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3d8e1f4a6c9'
down_revision: Union[str, Sequence[str], None] = 'e3a1c7d9b2f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('resumes', sa.Column('draft_document', sa.JSON(), nullable=True))
    op.add_column('resumes', sa.Column('draft_base_version_id', sa.String(length=36), nullable=True))
    op.add_column('resumes', sa.Column('draft_updated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('resumes', 'draft_updated_at')
    op.drop_column('resumes', 'draft_base_version_id')
    op.drop_column('resumes', 'draft_document')
