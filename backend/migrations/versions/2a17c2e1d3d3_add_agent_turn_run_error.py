"""add agent turn run error

运行失败静默（issue 4ff97）：运行体的终态 ErrorEvent 过去只写进子进程日志，轮次
以普通 cancelled 结算，界面判成 turn_closed，用户看不到任何失败原因。

- agent_turns.run_error 持久化已脱敏的结构化失败（类别 / provider / model / key 尾号）；
- agent_turns.run_id 记录是哪次受管运行创建了这个轮次，让子进程在超时或崩溃、
  没有上报错误时仍能被 supervisor 按 run id 兜底标记。

两列都允许为空，历史轮次保持原样；run_error 用 JSON 以便分类字段演进时不需要再
迁一次列。列与索引通过 batch 模式添加，让 SQLite（迁移回归测试）也适用。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2a17c2e1d3d3'
down_revision: Union[str, Sequence[str], None] = 'c4f1a9d2e6b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('agent_turns') as batch:
        batch.add_column(sa.Column('run_id', sa.String(length=64), nullable=True))
        batch.add_column(sa.Column('run_error', sa.JSON(), nullable=True))
        batch.create_index('ix_agent_turns_run_id', ['run_id'])


def downgrade() -> None:
    with op.batch_alter_table('agent_turns') as batch:
        batch.drop_index('ix_agent_turns_run_id')
        batch.drop_column('run_error')
        batch.drop_column('run_id')
