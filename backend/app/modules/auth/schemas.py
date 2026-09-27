from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field

from app.shared.schemas import ApiModel

UserRole = Literal["user", "admin"]


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


class UserResponse(ApiModel):
    id: str
    email: EmailStr
    display_name: str
    role: UserRole
    is_banned: bool
    created_at: datetime
