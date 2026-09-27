from datetime import datetime

from pydantic import EmailStr, Field

from app.shared.schemas import ApiModel


class RegisterRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=200)


class LoginRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordRequest(ApiModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class BanRequest(ApiModel):
    reason: str | None = Field(default=None, max_length=500)


class RoleUpdateRequest(ApiModel):
    role: str = Field(min_length=1, max_length=32)


class UserResponse(ApiModel):
    id: str
    email: EmailStr
    display_name: str
    # Highest-ranked role code, kept for display.
    role: str
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    is_banned: bool
    created_at: datetime


class PermissionResponse(ApiModel):
    code: str
    group: str
    name: str


class RoleResponse(ApiModel):
    code: str
    name: str
    description: str
    rank: int
    permissions: list[str] = Field(default_factory=list)
