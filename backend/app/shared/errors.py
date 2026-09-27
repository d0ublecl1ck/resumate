from enum import StrEnum

from pydantic import Field

from .schemas import ApiModel


class ErrorCode(StrEnum):
    """Stable machine error codes shared with clients (C-06)."""

    BASE_VERSION_STALE = "BASE_VERSION_STALE"
    TURN_ALREADY_CLOSED = "TURN_ALREADY_CLOSED"
    SCOPE_INSUFFICIENT = "SCOPE_INSUFFICIENT"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    TOKEN_REVOKED = "TOKEN_REVOKED"
    TEMPLATE_IN_USE = "TEMPLATE_IN_USE"
    VALIDATION_FAILED = "VALIDATION_FAILED"


class ApiError(ApiModel):
    """Error envelope returned for every domain failure."""

    code: ErrorCode
    message: str
    latest_version_id: str | None = Field(default=None)


class ApiException(Exception):
    """Base class for failures that map to a stable HTTP status and error code."""

    status_code: int = 500
    code: ErrorCode = ErrorCode.VALIDATION_FAILED

    def __init__(self, message: str, *, latest_version_id: str | None = None) -> None:
        super().__init__(message)
        self.latest_version_id = latest_version_id


class ResourceNotFound(ApiException):
    status_code = 404
    code = ErrorCode.RESOURCE_NOT_FOUND


class ValidationFailed(ApiException):
    status_code = 422
    code = ErrorCode.VALIDATION_FAILED


class BaseVersionStale(ApiException):
    status_code = 409
    code = ErrorCode.BASE_VERSION_STALE
