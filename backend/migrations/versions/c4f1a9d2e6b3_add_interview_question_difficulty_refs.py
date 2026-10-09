"""add interview question difficulty and knowledge refs

面试出题补全（US-14.1 / US-14.2）：
- interview_questions 增加 difficulty，记录建场或重新生成时指定的难度；
- interview_questions 增加 knowledge_refs，记录该题按题干检索岗位知识库命中的出处。

只新增可空列，不改既有列语义：历史题目两列均为 NULL，读取端统一收敛为
difficulty=None、knowledge_refs=[]，与既有行为一致。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4f1a9d2e6b3'
down_revision: Union[str, Sequence[str], None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('interview_questions', sa.Column('difficulty', sa.String(length=16), nullable=True))
    op.add_column('interview_questions', sa.Column('knowledge_refs', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('interview_questions', 'knowledge_refs')
    op.drop_column('interview_questions', 'difficulty')
