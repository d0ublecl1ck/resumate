from datetime import datetime

from pydantic import EmailStr, Field, model_validator

from app.shared.schemas import ApiModel


class RegisterRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=200)


class RegisterAccepted(ApiModel):
    """Registration is accepted, but no session exists until the mail link is used."""

    status: str = "verification_sent"
    email: EmailStr


class ResendVerificationRequest(ApiModel):
    """Resend by address (register success page) or by token (dead-link page)."""

    email: EmailStr | None = None
    token: str | None = Field(default=None, min_length=1, max_length=512)

    @model_validator(mode="after")
    def _require_exactly_one(self) -> "ResendVerificationRequest":
        if (self.email is None) == (self.token is None):
            raise ValueError("email 与 token 必须二选一")
        return self


class VerifyEmailRequest(ApiModel):
    token: str = Field(min_length=1, max_length=512)


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
    id: str
    code: str
    group: str
    name: str


class RoleResponse(ApiModel):
    id: str
    code: str
    name: str
    description: str
    rank: int
    is_system: bool = True
    permissions: list[str] = Field(default_factory=list)


class RoleCreate(ApiModel):
    code: str = Field(min_length=2, max_length=32)
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    permissions: list[str] = Field(default_factory=list)


class RoleUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    permissions: list[str] | None = None
