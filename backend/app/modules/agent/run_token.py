"""Short-lived, resume-scoped run credentials (issue 8f5fe).

The spawn path used to hand the child the caller's full session cookie: a
user-level credential that, leaked inside the hard-timeout window, could
impersonate the user across the whole API. A run credential replaces it with a
Bearer secret that is:

- bound to one (owner_id, resume_id, run_id) and to an expiry;
- short-lived (the runner timeout plus a small slack) and use-capped, because a
  single run makes many API calls — strict single-use would break the run;
- stored hashed in Redis, so a Redis dump cannot replay it;
- limited to the endpoints a run actually needs, and refused everywhere else,
  including the human-only approval endpoints.

Revocation happens when the child is reaped; the TTL is the backstop for when the
backend dies first.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import redis

RUN_TOKEN_PREFIX = "rsm_run_"
RUN_TOKEN_KEY_PREFIX = "agent:run_token:"
RUN_TOKEN_USES_KEY_PREFIX = "agent:run_token_uses:"
DEFAULT_MAX_USES = 1000


def hash_run_token(secret: str) -> str:
    """Redis keys store only the hash, exactly like sessions and PATs."""
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


@dataclass(frozen=True, slots=True)
class RunCredential:
    """The claims carried by one run credential."""

    owner_id: str
    resume_id: str
    run_id: str
    expires_at: datetime
    max_uses: int


def issue_run_token(
    client: redis.Redis,
    *,
    owner_id: str,
    resume_id: str,
    run_id: str,
    ttl_seconds: int,
    max_uses: int = DEFAULT_MAX_USES,
) -> str:
    """Mint one credential and return its raw secret (never stored, never logged)."""
    ttl = max(1, int(ttl_seconds))
    secret = f"{RUN_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"
    token_hash = hash_run_token(secret)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl)
    payload = {
        "ownerId": owner_id,
        "resumeId": resume_id,
        "runId": run_id,
        "expiresAt": expires_at.isoformat(),
        "maxUses": max(1, int(max_uses)),
    }
    client.set(f"{RUN_TOKEN_KEY_PREFIX}{token_hash}", json.dumps(payload), ex=ttl)
    client.delete(f"{RUN_TOKEN_USES_KEY_PREFIX}{token_hash}")
    return secret


def lookup_run_token(client: redis.Redis, secret: str) -> RunCredential | None:
    """Resolve a credential without consuming anything."""
    raw = client.get(f"{RUN_TOKEN_KEY_PREFIX}{hash_run_token(secret)}")
    if raw is None:
        return None
    data = json.loads(raw)
    return RunCredential(
        owner_id=str(data["ownerId"]),
        resume_id=str(data["resumeId"]),
        run_id=str(data.get("runId") or ""),
        expires_at=datetime.fromisoformat(str(data["expiresAt"])),
        max_uses=int(data.get("maxUses", DEFAULT_MAX_USES)),
    )


def register_use(client: redis.Redis, secret: str) -> int:
    """Count one successful authentication and return the running total."""
    token_hash = hash_run_token(secret)
    uses_key = f"{RUN_TOKEN_USES_KEY_PREFIX}{token_hash}"
    count = int(client.incr(uses_key))
    if count == 1:
        ttl = int(client.ttl(f"{RUN_TOKEN_KEY_PREFIX}{token_hash}") or 0)
        client.expire(uses_key, ttl if ttl > 0 else 60)
    return count


def revoke_run_token(client: redis.Redis, secret: str) -> None:
    """Delete a credential; best effort so a Redis blip cannot break the supervisor."""
    token_hash = hash_run_token(secret)
    try:
        client.delete(f"{RUN_TOKEN_KEY_PREFIX}{token_hash}", f"{RUN_TOKEN_USES_KEY_PREFIX}{token_hash}")
    except redis.RedisError:  # pragma: no cover - defensive
        pass


# --- endpoint scope ----------------------------------------------------------

# Approval decisions must keep flowing through require_human_session so the
# denial is audited with its own purpose and the e9ad6 rule stays intact.
_HUMAN_ONLY_PATH = re.compile(r"^/pending-actions/[^/]+/(?:approve|reject)$")
_RESUME_PATH = re.compile(r"^/resumes/([^/]+)(?:/|$)")
_TURN_PATH = re.compile(r"^/turns/([^/]+)(?:/|$)")

# Exactly what resumate-agent needs: open a turn, read/write its checkpoint, run
# the patch flow, close the turn, and mirror conversation history.
_ALLOWED_ENDPOINTS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("GET", re.compile(r"^/\.well-known/resume-agent$")),
    ("POST", re.compile(r"^/resumes/[^/]+/turns$")),
    ("GET", re.compile(r"^/resumes/[^/]+/working-document$")),
    ("GET", re.compile(r"^/turns/[^/]+$")),
    ("GET", re.compile(r"^/turns/[^/]+/pending-actions$")),
    ("GET", re.compile(r"^/turns/[^/]+/state$")),
    ("PUT", re.compile(r"^/turns/[^/]+/state$")),
    ("POST", re.compile(r"^/turns/[^/]+/patches:(?:validate|preview|apply)$")),
    ("POST", re.compile(r"^/turns/[^/]+/(?:finalize|cancel)$")),
    ("POST", re.compile(r"^/sessions$")),
    ("GET", re.compile(r"^/sessions$")),
    ("GET", re.compile(r"^/sessions/[^/]+/messages$")),
    ("POST", re.compile(r"^/sessions/[^/]+/messages$")),
)


def is_human_only_path(path: str) -> bool:
    """Whether the path is a human decision that require_human_session owns."""
    return bool(_HUMAN_ONLY_PATH.match(path))


def endpoint_allowed(method: str, path: str) -> bool:
    """Whether a run credential may call this method and path at all."""
    return any(method == allowed and pattern.match(path) for allowed, pattern in _ALLOWED_ENDPOINTS)


def path_resume_id(path: str) -> str | None:
    """The resume id named directly in the path, when there is one."""
    match = _RESUME_PATH.match(path)
    return match.group(1) if match else None


def path_turn_id(path: str) -> str | None:
    """The turn id named in the path; its resume needs a lookup."""
    match = _TURN_PATH.match(path)
    return match.group(1) if match else None
