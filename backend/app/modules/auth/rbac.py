"""Built-in role and permission catalogue for the three-table RBAC model.

users / roles / permissions are the three entities; user_roles and
role_permissions are the many-to-many links. Role inheritance is expressed by
granting supersets of permissions, not by runtime rank checks, except where an
actor must outrank a target (ban / role assignment).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class PermissionSpec:
    code: str
    group: str
    name: str


@dataclass(frozen=True)
class RoleSpec:
    code: str
    name: str
    rank: int
    description: str
    permissions: tuple[str, ...]


PERMISSIONS: tuple[PermissionSpec, ...] = (
    PermissionSpec("account:read", "account", "读取自己的账号"),
    PermissionSpec("account:write", "account", "修改自己的账号"),
    PermissionSpec("resume:read", "resume", "读取简历"),
    PermissionSpec("resume:write", "resume", "编辑简历"),
    PermissionSpec("jd:read", "jd", "读取岗位"),
    PermissionSpec("jd:write", "jd", "编辑岗位"),
    PermissionSpec("profile:read", "profile", "读取职业事实"),
    PermissionSpec("profile:write", "profile", "编辑职业事实"),
    PermissionSpec("settings:read", "settings", "读取设置"),
    PermissionSpec("settings:write", "settings", "修改设置"),
    PermissionSpec("access:read", "access", "读取访问令牌与审计"),
    PermissionSpec("access:write", "access", "签发与撤销访问令牌"),
    PermissionSpec("backup:read", "backup", "导出备份"),
    PermissionSpec("backup:write", "backup", "导入备份"),
    PermissionSpec("user:read", "user", "读取用户列表"),
    PermissionSpec("user:ban", "user", "封禁用户"),
    PermissionSpec("user:unban", "user", "解除封禁"),
    PermissionSpec("role:read", "role", "读取角色与权限"),
    PermissionSpec("role:assign", "role", "分配用户角色"),
)

_USER_PERMISSIONS: tuple[str, ...] = (
    "account:read",
    "account:write",
    "resume:read",
    "resume:write",
    "jd:read",
    "jd:write",
    "profile:read",
    "profile:write",
    "settings:read",
    "settings:write",
    "access:read",
    "access:write",
    "backup:read",
    "backup:write",
)
_ADMIN_PERMISSIONS: tuple[str, ...] = _USER_PERMISSIONS + ("user:read", "user:ban", "user:unban")
_SUPER_ADMIN_PERMISSIONS: tuple[str, ...] = _ADMIN_PERMISSIONS + ("role:read", "role:assign")

ROLES: tuple[RoleSpec, ...] = (
    RoleSpec("user", "普通用户", 1, "只能操作自己的简历、岗位、事实与设置。", _USER_PERMISSIONS),
    RoleSpec("admin", "管理员", 2, "在普通用户之上可查看与封禁普通用户。", _ADMIN_PERMISSIONS),
    RoleSpec("super_admin", "超级管理员", 3, "拥有全部权限，可分配角色。", _SUPER_ADMIN_PERMISSIONS),
)

PERMISSION_CODES: frozenset[str] = frozenset(spec.code for spec in PERMISSIONS)
ROLE_CODES: tuple[str, ...] = tuple(spec.code for spec in ROLES)
ROLE_RANK: dict[str, int] = {spec.code: spec.rank for spec in ROLES}
DEFAULT_ROLE_CODE = "user"
BOOTSTRAP_ROLE_CODE = "super_admin"


def role_permissions(code: str) -> tuple[str, ...]:
    for spec in ROLES:
        if spec.code == code:
            return spec.permissions
    return ()
