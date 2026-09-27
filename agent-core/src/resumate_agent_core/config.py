"""Runtime configuration for the agent-core package.

Settings are intentionally dependency-light: only the standard library is used
here, so importing configuration never pulls in a web framework, ORM, or
database driver. Credentials are supplied by the caller and are never
persisted or logged by this package.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, replace

ENV_PREFIX = "RESUME_AGENT_CORE_"
DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_SESSION_COOKIE_NAME = "resumate_session"
DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_CLIENT_ID = "external"

_TRUE_VALUES = {"1", "true", "yes", "on"}
_FALSE_VALUES = {"0", "false", "no", "off"}


def _read(env: Mapping[str, str], suffix: str) -> str | None:
    value = env.get(f"{ENV_PREFIX}{suffix}")
    if value is None:
        return None
    value = value.strip()
    return value or None


def _read_bool(env: Mapping[str, str], suffix: str, default: bool) -> bool:
    raw = _read(env, suffix)
    if raw is None:
        return default
    lowered = raw.lower()
    if lowered in _TRUE_VALUES:
        return True
    if lowered in _FALSE_VALUES:
        return False
    raise ValueError(f"{ENV_PREFIX}{suffix} must be a boolean, got {raw!r}")


def _read_float(env: Mapping[str, str], suffix: str, default: float) -> float:
    raw = _read(env, suffix)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError as exc:  # pragma: no cover - defensive branch
        raise ValueError(f"{ENV_PREFIX}{suffix} must be a number, got {raw!r}") from exc


@dataclass(frozen=True, slots=True)
class AgentCoreSettings:
    """Connection settings for the public Resumate REST API.

    The client authenticates with the same server-side session used by the web
    app: pass the HttpOnly session cookie value through session_cookie (or the
    RESUME_AGENT_CORE_SESSION_COOKIE variable). token is reserved for the future
    PAT/bearer flow and is sent as an Authorization: Bearer header when set.
    """

    base_url: str = DEFAULT_BASE_URL
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS
    session_cookie_name: str = DEFAULT_SESSION_COOKIE_NAME
    session_cookie: str | None = None
    token: str | None = None
    verify_ssl: bool = True
    default_client_id: str = DEFAULT_CLIENT_ID

    def __post_init__(self) -> None:
        base_url = (self.base_url or "").strip().rstrip("/")
        if not base_url:
            raise ValueError("base_url must be a non-empty absolute URL")
        if self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be greater than zero")
        if not self.session_cookie_name.strip():
            raise ValueError("session_cookie_name must be non-empty")
        object.__setattr__(self, "base_url", base_url)
        object.__setattr__(self, "session_cookie_name", self.session_cookie_name.strip())

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "AgentCoreSettings":
        """Build settings from RESUME_AGENT_CORE_* environment variables."""
        source: Mapping[str, str] = os.environ if env is None else env
        return cls(
            base_url=_read(source, "BASE_URL") or DEFAULT_BASE_URL,
            timeout_seconds=_read_float(source, "TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS),
            session_cookie_name=_read(source, "SESSION_COOKIE_NAME") or DEFAULT_SESSION_COOKIE_NAME,
            session_cookie=_read(source, "SESSION_COOKIE"),
            token=_read(source, "TOKEN"),
            verify_ssl=_read_bool(source, "VERIFY_SSL", True),
            default_client_id=_read(source, "CLIENT_ID") or DEFAULT_CLIENT_ID,
        )

    def with_session_cookie(self, value: str | None) -> "AgentCoreSettings":
        """Return a copy carrying a different session cookie value."""
        return replace(self, session_cookie=value)

    @property
    def authenticated(self) -> bool:
        """Whether any credential is configured."""
        return bool(self.session_cookie or self.token)

    def auth_headers(self) -> dict[str, str]:
        """Headers applied to every request for the configured credentials."""
        headers: dict[str, str] = {"Accept": "application/json"}
        if self.session_cookie:
            headers["Cookie"] = f"{self.session_cookie_name}={self.session_cookie}"
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def cookies(self) -> dict[str, str]:
        """Session cookies as a mapping, for callers that prefer httpx cookies."""
        if not self.session_cookie:
            return {}
        return {self.session_cookie_name: self.session_cookie}
