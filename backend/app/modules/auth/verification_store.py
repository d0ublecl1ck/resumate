"""Redis-backed email verification tokens and send quotas.

The raw token only travels inside the verification mail. Redis stores its
SHA-256 hash, mirroring session_store, so a Redis dump alone cannot be replayed.
Tokens are single-use: consume_verification deletes the key before returning.
"""

import hashlib
import json
import secrets

import redis

VERIFICATION_PREFIX = "auth:email_verify:"
SEND_QUOTA_PREFIX = "auth:email_send_quota:"
RESEND_COOLDOWN_PREFIX = "auth:email_resend_cooldown:"


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_verification(client: redis.Redis, user_id: str, *, ttl_seconds: int) -> str:
    """Create a single-use token for the user and return the raw value."""
    token = secrets.token_urlsafe(32)
    client.set(f"{VERIFICATION_PREFIX}{_token_hash(token)}", json.dumps({"userId": user_id}), ex=ttl_seconds)
    return token


def consume_verification(client: redis.Redis, token: str) -> str | None:
    """Return the user id and delete the token, or None when unknown or expired."""
    key = f"{VERIFICATION_PREFIX}{_token_hash(token)}"
    payload = client.get(key)
    if payload is None:
        return None
    client.delete(key)
    return json.loads(payload)["userId"]


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
