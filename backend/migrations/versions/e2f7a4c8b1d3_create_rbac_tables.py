"""create rbac tables and migrate users.role

Merges the two pre-existing heads (users table and access/settings tables).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e2f7a4c8b1d3'
down_revision: Union[str, Sequence[str], None] = ('266319458ead', 'd4b8e2a6f1c9')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('permissions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('code', sa.String(length=64), nullable=False),
    sa.Column('group', sa.String(length=32), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_permissions_code'), 'permissions', ['code'], unique=True)
    op.create_table('roles',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('code', sa.String(length=32), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('description', sa.String(length=500), nullable=False),
    sa.Column('rank', sa.Integer(), nullable=False),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_roles_code'), 'roles', ['code'], unique=True)
    op.create_table('role_permissions',
    sa.Column('role_id', sa.String(length=36), nullable=False),
    sa.Column('permission_id', sa.String(length=36), nullable=False),
    sa.PrimaryKeyConstraint('role_id', 'permission_id')
    )
    op.create_table('user_roles',
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('role_id', sa.String(length=36), nullable=False),
    sa.PrimaryKeyConstraint('user_id', 'role_id')
    )
    # System roles must exist before the legacy users.role values can be linked.
    op.execute(
        "INSERT INTO roles (id, code, name, description, rank, is_system, created_at, updated_at) VALUES "
        "('role_user', 'user', '普通用户', '', 1, true, now(), now()), "
        "('role_admin', 'admin', '管理员', '', 2, true, now(), now()), "
        "('role_super_admin', 'super_admin', '超级管理员', '', 3, true, now(), now())"
    )
    op.execute(
        "INSERT INTO user_roles (user_id, role_id) "
        "SELECT u.id, r.id FROM users u JOIN roles r ON r.code = u.role"
    )
    op.drop_column('users', 'role')


def downgrade() -> None:
    op.add_column('users', sa.Column('role', sa.String(length=32), nullable=False, server_default='user'))
    op.execute(
        "UPDATE users SET role = COALESCE(("
        "SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id "
        "WHERE ur.user_id = users.id ORDER BY r.rank DESC LIMIT 1"
        "), 'user')"
    )
    op.drop_table('user_roles')
    op.drop_table('role_permissions')
    op.drop_index(op.f('ix_roles_code'), table_name='roles')
    op.drop_table('roles')
    op.drop_index(op.f('ix_permissions_code'), table_name='permissions')
    op.drop_table('permissions')
