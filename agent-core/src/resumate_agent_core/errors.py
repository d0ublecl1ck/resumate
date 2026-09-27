"""Translate public-API error envelopes into typed client exceptions.

The server returns every business failure as an envelope shaped
{ "code": ..., "message": ..., "latestVersionId": ... } (contract section 2).
This module normalizes that payload into ApiClientError so callers can branch
on a stable machine code instead of parsing strings.
"""

from __future__ import annotations

from collections.abc import Mapping
from enum import StrEnum
from typing import Any

import httpx


class ErrorCode(StrEnum):
    """Machine error codes known to the agent-core package.

    The public contract freezes a subset of these; the transport/malformed
    codes are produced locally by the client. Unknown server codes are still
    surfaced verbatim on ApiClientError.code.
    """

    # Produced locally by this package.
    TRANSPORT_ERROR = "TRANSPORT_ERROR"
    MALFORMED_RESPONSE = "MALFORMED_RESPONSE"
    # Mirrored from the server contract (sections 7, 8, 10).
    VALIDATION_FAILED = "VALIDATION_FAILED"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    FORBIDDEN = "FORBIDDEN"
    UNAUTHENTICATED = "UNAUTHENTICATED"
    SCOPE_INSUFFICIENT = "SCOPE_INSUFFICIENT"
    BASE_VERSION_STALE = "BASE_VERSION_STALE"
    TURN_ALREADY_CLOSED = "TURN_ALREADY_CLOSED"
    TURN_NOT_OPEN = "TURN_NOT_OPEN"
    PENDING_ACTION_NOT_APPROVED = "PENDING_ACTION_NOT_APPROVED"
    PENDING_ACTION_STALE = "PENDING_ACTION_STALE"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    SECTION_NOT_FOUND = "SECTION_NOT_FOUND"
    ENTRY_NOT_FOUND = "ENTRY_NOT_FOUND"


def normalize_error_envelope(body: Any) -> dict[str, Any]:
    """Normalize an arbitrary error body into the frozen envelope keys.

    The result always contains string code and message keys; a missing or
    non-string code becomes "UNKNOWN".
    """

    code: Any = None
    message: Any = None
    latest_version_id: Any = None
    if isinstance(body, Mapping):
        code = body.get("code")
        message = body.get("message")
        latest_version_id = body.get("latestVersionId", body.get("latest_version_id"))
    if not isinstance(code, str) or not code:
        code = "UNKNOWN"
    if not isinstance(message, str) or not message:
        message = code if code != "UNKNOWN" else "Request failed"
    return {
        "code": code,
        "message": message,
        "latest_version_id": latest_version_id if isinstance(latest_version_id, str) else None,
    }


_RETRYABLE_STATUSES = frozenset({408, 409, 425, 429})


class ApiClientError(Exception):
    """A failed public-API call carrying the frozen error envelope fields."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "UNKNOWN",
        status_code: int | None = None,
        latest_version_id: str | None = None,
        payload: Any = None,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.latest_version_id = latest_version_id
        self.payload = payload
        self.retryable = retryable

    def is_code(self, *codes: str) -> bool:
        """Whether the error matches any of the given machine codes."""
        return self.code in codes

    def __str__(self) -> str:
        if self.status_code is None:
            return f"[{self.code}] {self.message}"
        return f"[{self.code}] {self.message} (HTTP {self.status_code})"

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}(code={self.code!r}, status_code={self.status_code!r}, "
            f"latest_version_id={self.latest_version_id!r})"
        )

    @classmethod
    def from_response(cls, response: httpx.Response) -> "ApiClientError":
        """Build an error from an HTTP response, decoding the shared envelope."""
        body: Any = None
        try:
            body = response.json()
        except ValueError:
            body = response.text or None
        envelope = normalize_error_envelope(body)
        status = response.status_code
        return cls(
            envelope["message"],
            code=envelope["code"],
            status_code=status,
            latest_version_id=envelope["latest_version_id"],
            payload=body,
            retryable=status in _RETRYABLE_STATUSES or status >= 500,
        )


class TransportError(ApiClientError):
    """A network/transport failure that never reached an HTTP response."""

    def __init__(self, message: str, *, cause: BaseException | None = None) -> None:
        super().__init__(message, code=ErrorCode.TRANSPORT_ERROR, retryable=True)
        self.cause = cause


class MalformedResponseError(ApiClientError):
    """A 2xx response whose body was not the expected JSON document."""

    def __init__(self, message: str, *, status_code: int | None = None, payload: Any = None) -> None:
        super().__init__(
            message,
            code=ErrorCode.MALFORMED_RESPONSE,
            status_code=status_code,
            payload=payload,
        )
