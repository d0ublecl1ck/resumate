"""Redis-backed password reset tokens and send quotas.

Mirrors verification_store: the raw token only travels inside the reset mail and
Redis stores its SHA-256 hash, so a Redis dump alone cannot be replayed. Tokens
are single-use.

The lookup record exists for a different reason than in the verification flow:
`POST /auth/password/reset` resolves the account before consuming the token, so a
rejected new password (for example "same as the current one") does not burn the
link. A successful reset deletes both records, so a used link reports invalid
immediately instead of on the next step.
"""

import hashlib
import json
import secrets

import redis

RESET_PREFIX = "auth:password_reset:"
LOOKUP_PREFIX = "auth:password_reset_lookup:"
SEND_QUOTA_PREFIX = "auth:password_reset_quota:"
RESEND_COOLDOWN_PREFIX = "auth:password_reset_cooldown:"


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_reset(client: redis.Redis, user_id: str, *, ttl_seconds: int, lookup_ttl_seconds: int) -> str:
    """Create a single-use reset token plus the lookup record that outlives it."""
    token = secrets.token_urlsafe(32)
    token_hash = _token_hash(token)
    client.set(f"{RESET_PREFIX}{token_hash}", json.dumps({"userId": user_id}), ex=ttl_seconds)
    client.set(f"{LOOKUP_PREFIX}{token_hash}", json.dumps({"userId": user_id}), ex=lookup_ttl_seconds)
    return token


def lookup_reset(client: redis.Redis, token: str) -> str | None:
    """Resolve the user behind a token without consuming it."""
    payload = client.get(f"{LOOKUP_PREFIX}{_token_hash(token)}")
    if payload is None:
        return None
    return json.loads(payload)["userId"]


def consume_reset(client: redis.Redis, token: str) -> str | None:
    """Return the user id and retire the link, or None when unknown or expired."""
    token_hash = _token_hash(token)
    key = f"{RESET_PREFIX}{token_hash}"
    payload = client.get(key)
    if payload is None:
        return None
    client.delete(key, f"{LOOKUP_PREFIX}{token_hash}")
    return json.loads(payload)["userId"]


def discard_reset(client: redis.Redis, email: str, token: str) -> None:
    """Undo an issued token and its cooldown after the mail could not be delivered.

    Without this, the next attempt would hit the cooldown and be answered with the
    neutral 202 while nothing was sent, silently reintroducing the false success.
    """
    token_hash = _token_hash(token)
    client.delete(f"{RESET_PREFIX}{token_hash}", f"{LOOKUP_PREFIX}{token_hash}", f"{RESEND_COOLDOWN_PREFIX}{email}")


def in_resend_cooldown(client: redis.Redis, email: str) -> bool:
    return client.exists(f"{RESEND_COOLDOWN_PREFIX}{email}") == 1


def start_resend_cooldown(client: redis.Redis, email: str, *, seconds: int) -> None:
    if seconds > 0:
        client.set(f"{RESEND_COOLDOWN_PREFIX}{email}", "1", ex=seconds)


def is_within_send_quota(client: redis.Redis, email: str, *, limit: int, window_seconds: int = 3600) -> bool:
    """Count this send attempt against the hourly quota and report whether it fits."""
    key = f"{SEND_QUOTA_PREFIX}{email}"
    count = client.incr(key)
    if count == 1:
        client.expire(key, window_seconds)
    return count <= limit
