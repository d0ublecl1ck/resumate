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
LOOKUP_PREFIX = "auth:email_verify_lookup:"
SEND_QUOTA_PREFIX = "auth:email_send_quota:"
RESEND_COOLDOWN_PREFIX = "auth:email_resend_cooldown:"


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_verification(client: redis.Redis, user_id: str, *, ttl_seconds: int, lookup_ttl_seconds: int) -> str:
    """Create a single-use token plus a longer-lived lookup record.

    The token expires (or is consumed) quickly. The lookup record outlives it so
    the dead-link page can ask for a resend without the user retyping the address.
    """
    token = secrets.token_urlsafe(32)
    token_hash = _token_hash(token)
    client.set(f"{VERIFICATION_PREFIX}{token_hash}", json.dumps({"userId": user_id}), ex=ttl_seconds)
    client.set(f"{LOOKUP_PREFIX}{token_hash}", json.dumps({"userId": user_id}), ex=lookup_ttl_seconds)
    return token


def lookup_verification(client: redis.Redis, token: str) -> str | None:
    """Resolve the user behind a token without consuming it."""
    payload = client.get(f"{LOOKUP_PREFIX}{_token_hash(token)}")
    if payload is None:
        return None
    return json.loads(payload)["userId"]


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
