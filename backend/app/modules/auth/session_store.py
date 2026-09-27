"""Redis-backed opaque session store.

The raw token never reaches Redis: the key is the SHA-256 of the token, so a Redis
dump alone cannot be replayed. Deleting the session key invalidates the token on the
next request, which is what logout, password change and ban rely on.
"""

import hashlib
import json
import secrets

import redis

SESSION_PREFIX = "auth:session:"
USER_INDEX_PREFIX = "auth:user_sessions:"


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _session_key(token_hash: str) -> str:
    return f"{SESSION_PREFIX}{token_hash}"


def _user_index(user_id: str) -> str:
    return f"{USER_INDEX_PREFIX}{user_id}"


def issue_session(client: redis.Redis, user_id: str, *, ttl_seconds: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = _token_hash(token)
    client.set(_session_key(token_hash), json.dumps({"userId": user_id}), ex=ttl_seconds)
    index = _user_index(user_id)
    client.sadd(index, token_hash)
    client.expire(index, ttl_seconds)
    return token


def get_session_user_id(client: redis.Redis, token: str) -> str | None:
    payload = client.get(_session_key(_token_hash(token)))
    if payload is None:
        return None
    return json.loads(payload)["userId"]


def revoke_session(client: redis.Redis, token: str) -> None:
    token_hash = _token_hash(token)
    key = _session_key(token_hash)
    payload = client.get(key)
    if payload is not None:
        client.srem(_user_index(json.loads(payload)["userId"]), token_hash)
    client.delete(key)


def revoke_all_sessions(client: redis.Redis, user_id: str) -> int:
    """Delete every session of a user and return how many were revoked."""
    index = _user_index(user_id)
    token_hashes = client.smembers(index)
    if token_hashes:
        client.delete(*[_session_key(token_hash) for token_hash in token_hashes])
    client.delete(index)
    return len(token_hashes)
