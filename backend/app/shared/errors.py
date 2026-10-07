from enum import StrEnum

from pydantic import Field

from .schemas import ApiModel


class ErrorCode(StrEnum):
    """Stable machine error codes shared with clients (C-06)."""

    BASE_VERSION_STALE = "BASE_VERSION_STALE"
    TURN_ALREADY_CLOSED = "TURN_ALREADY_CLOSED"
    TURN_NOT_OPEN = "TURN_NOT_OPEN"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    PENDING_ACTION_NOT_APPROVED = "PENDING_ACTION_NOT_APPROVED"
    PENDING_ACTION_STALE = "PENDING_ACTION_STALE"
    REBASE_CONFLICT = "REBASE_CONFLICT"
    RUN_STATE_CONFLICT = "RUN_STATE_CONFLICT"
    MODEL_NOT_CONFIGURED = "MODEL_NOT_CONFIGURED"
    UPSTREAM_TIMEOUT = "UPSTREAM_TIMEOUT"
    UPSTREAM_REJECTED = "UPSTREAM_REJECTED"
    MODEL_OUTPUT_INVALID = "MODEL_OUTPUT_INVALID"
    SCOPE_INSUFFICIENT = "SCOPE_INSUFFICIENT"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    TOKEN_REVOKED = "TOKEN_REVOKED"
    TEMPLATE_IN_USE = "TEMPLATE_IN_USE"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    UNAUTHENTICATED = "UNAUTHENTICATED"
    INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    ACCOUNT_BANNED = "ACCOUNT_BANNED"
    FORBIDDEN = "FORBIDDEN"
    EMAIL_ALREADY_REGISTERED = "EMAIL_ALREADY_REGISTERED"
    EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED"
    VERIFICATION_TOKEN_INVALID = "VERIFICATION_TOKEN_INVALID"
    PASSWORD_RESET_TOKEN_INVALID = "PASSWORD_RESET_TOKEN_INVALID"
    RESEND_TOO_SOON = "RESEND_TOO_SOON"
    RATE_LIMITED = "RATE_LIMITED"


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


class TurnAlreadyClosed(ApiException):
    status_code = 409
    code = ErrorCode.TURN_ALREADY_CLOSED


class TurnNotOpen(ApiException):
    status_code = 409
    code = ErrorCode.TURN_NOT_OPEN


class IdempotencyConflict(ApiException):
    status_code = 409
    code = ErrorCode.IDEMPOTENCY_CONFLICT


class PendingActionNotApproved(ApiException):
    status_code = 409
    code = ErrorCode.PENDING_ACTION_NOT_APPROVED


class PendingActionStale(ApiException):
    status_code = 409
    code = ErrorCode.PENDING_ACTION_STALE


class RebaseConflict(ApiException):
    status_code = 409
    code = ErrorCode.REBASE_CONFLICT


class RunStateConflict(ApiException):
    status_code = 409
    code = ErrorCode.RUN_STATE_CONFLICT


class ModelNotConfigured(ApiException):
    status_code = 409
    code = ErrorCode.MODEL_NOT_CONFIGURED


class UpstreamTimeout(ApiException):
    status_code = 504
    code = ErrorCode.UPSTREAM_TIMEOUT


class UpstreamRejected(ApiException):
    status_code = 502
    code = ErrorCode.UPSTREAM_REJECTED


class ModelOutputInvalid(ApiException):
    status_code = 502
    code = ErrorCode.MODEL_OUTPUT_INVALID


class Unauthenticated(ApiException):
    status_code = 401
    code = ErrorCode.UNAUTHENTICATED


class InvalidCredentials(ApiException):
    status_code = 401
    code = ErrorCode.INVALID_CREDENTIALS


class TokenRevoked(ApiException):
    status_code = 401
    code = ErrorCode.TOKEN_REVOKED


class AccountBanned(ApiException):
    status_code = 403
    code = ErrorCode.ACCOUNT_BANNED


class Forbidden(ApiException):
    status_code = 403
    code = ErrorCode.FORBIDDEN


class ScopeInsufficient(ApiException):
    status_code = 403
    code = ErrorCode.SCOPE_INSUFFICIENT


class EmailAlreadyRegistered(ApiException):
    status_code = 409
    code = ErrorCode.EMAIL_ALREADY_REGISTERED


class EmailNotVerified(ApiException):
    status_code = 403
    code = ErrorCode.EMAIL_NOT_VERIFIED


class VerificationTokenInvalid(ApiException):
    status_code = 400
    code = ErrorCode.VERIFICATION_TOKEN_INVALID


class PasswordResetTokenInvalid(ApiException):
    status_code = 400
    code = ErrorCode.PASSWORD_RESET_TOKEN_INVALID


class ResendTooSoon(ApiException):
    status_code = 429
    code = ErrorCode.RESEND_TOO_SOON


class RateLimited(ApiException):
    status_code = 429
    code = ErrorCode.RATE_LIMITED
