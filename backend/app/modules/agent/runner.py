"""Spawn the resumate-agent CLI for one run (issue 83c41).

The runner is a separate process: the backend never calls a model itself. The
model API key is decrypted per run and handed to the child through its
environment (never argv, so it does not show up in ps). The child exits when the
run ends, so the credential lives only for that process. The child sees a
minimal environment that excludes the backend's own secrets (DATABASE_URL,
SETTINGS_SECRET_KEY, ...).
"""

from __future__ import annotations

import os
import signal
import subprocess
import threading
from collections.abc import Iterator

import redis
from pathlib import Path
from uuid import uuid4

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import CurrentUser
from app.modules.resume import service as resume_service
from app.modules.settings import dao as settings_dao
from app.modules.settings import service as settings_service
from app.shared.errors import ModelNotConfigured, RateLimited, ResourceNotFound

from . import dao, run_token
from .schemas import RunStartRequest, RunStartResponse, SessionRunStartRequest

_ACTIVE_LOCK = threading.Lock()
_ACTIVE_RUNS: dict[str, subprocess.Popen] = {}
# run id -> (raw credential, the Redis client that stores it). Kept so the
# supervisor can revoke the credential the moment the child is reaped.
_ACTIVE_TOKENS: dict[str, tuple[str, redis.Redis]] = {}
_ACTIVE_COUNT = 0

_EXECUTION_MODES = ("approval", "full_access")


def _reset_state() -> None:
    """Test helper: clear the run registry and the concurrency counter."""
    global _ACTIVE_COUNT
    with _ACTIVE_LOCK:
        _ACTIVE_RUNS.clear()
        _ACTIVE_TOKENS.clear()
        _ACTIVE_COUNT = 0


def active_run_count() -> int:
    """Number of runner processes the backend is currently supervising."""
    with _ACTIVE_LOCK:
        return len(_ACTIVE_RUNS)


def _acquire_slot() -> bool:
    global _ACTIVE_COUNT
    limit = max(1, get_settings().agent_runner_max_concurrent)
    with _ACTIVE_LOCK:
        if _ACTIVE_COUNT >= limit:
            return False
        _ACTIVE_COUNT += 1
        return True


def _release_slot(run_id: str) -> None:
    global _ACTIVE_COUNT
    with _ACTIVE_LOCK:
        _ACTIVE_RUNS.pop(run_id, None)
        credential = _ACTIVE_TOKENS.pop(run_id, None)
        if _ACTIVE_COUNT > 0:
            _ACTIVE_COUNT -= 1
    if credential is not None:
        secret, client = credential
        run_token.revoke_run_token(client, secret)


def _resolve_model_config(db: Session, user: CurrentUser) -> tuple[str, str, str]:
    settings_row = settings_dao.get_by_owner(db, user.id)
    config = (settings_row.model_config if settings_row is not None else {}) or {}
    model = str(config.get("model") or "").strip()
    endpoint = str(config.get("endpoint") or "").strip()
    api_key = settings_service.decrypt_api_key(config.get("apiKey"))
    if not api_key or not model:
        raise ModelNotConfigured("尚未配置模型密钥，请先在设置中完成模型配置")
    return model, endpoint, api_key


def _require_owned_session(db: Session, owner_id: str, session_id: str) -> None:
    session = dao.get_session(db, session_id)
    if session is None or session.owner_id != owner_id:
        raise ResourceNotFound(f"会话 {session_id} 不存在")


def _execution_mode(db: Session, user: CurrentUser, requested: str | None) -> str | None:
    """Explicit request wins; otherwise fall back to the account's nextRunMode."""
    if requested in _EXECUTION_MODES:
        return requested
    settings_row = settings_dao.get_by_owner(db, user.id)
    config = (settings_row.agent_config if settings_row is not None else {}) or {}
    mode = config.get("nextRunMode")
    return mode if mode in _EXECUTION_MODES else None


def _child_command(
    command: str,
    *,
    resume_id: str,
    prompt: str,
    execution_mode: str | None,
    session_id: str | None,
) -> list[str]:
    """Non-secret arguments only; credentials go through the environment."""
    argv = [command]
    if resume_id:
        argv += ["--resume-id", resume_id]
    argv += ["--prompt", prompt]
    if execution_mode:
        argv += ["--execution-mode", execution_mode]
    if session_id:
        argv += ["--session", session_id]
    return argv


def _child_env(
    *,
    base_url: str,
    token: str,
    model: str,
    endpoint: str,
    api_key: str,
) -> dict[str, str]:
    """Minimal environment: no backend secrets, only what the runner needs.

    The child receives a short-lived run credential, never the caller's session
    cookie: a leaked child environment is then worth only one resume until the
    credential expires or is revoked.
    """
    env = {
        "PATH": os.environ.get("PATH", ""),
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "PYTHONUNBUFFERED": "1",
        "RESUME_AGENT_CORE_BASE_URL": base_url,
        "RESUME_AGENT_CORE_TOKEN": token,
        "RESUME_AGENT_CORE_MODEL": model,
        "RESUME_AGENT_CORE_API_KEY": api_key,
    }
    if endpoint:
        env["RESUME_AGENT_CORE_PROVIDER_BASE_URL"] = endpoint
    return env


def _kill_process_group(proc: subprocess.Popen) -> None:
    """SIGKILL the whole process group so runner grandchildren cannot survive."""
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):  # pragma: no cover - raced exit
        proc.kill()


def _supervise(run_id: str, proc: subprocess.Popen, timeout: float) -> None:
    """Reap the child, hard-killing it when it outlives the timeout."""
    try:
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            _kill_process_group(proc)
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:  # pragma: no cover - defensive
                pass
    finally:
        _release_slot(run_id)


def start_run(
    db: Session,
    user: CurrentUser,
    resume_id: str,
    payload: RunStartRequest,
    request: Request,
    client: redis.Redis,
) -> RunStartResponse:
    """Validate a resume run, then spawn one runner process; return before it finishes."""
    resume_service.get_resume(db, user.id, resume_id)
    if payload.session_id:
        _require_owned_session(db, user.id, payload.session_id)
    return _spawn(
        db,
        user,
        resume_id=resume_id,
        session_id=payload.session_id,
        prompt=payload.prompt,
        execution_mode=_execution_mode(db, user, payload.execution_mode),
        request=request,
        client=client,
    )


def start_session_run(
    db: Session,
    user: CurrentUser,
    session_id: str,
    payload: SessionRunStartRequest,
    request: Request,
    client: redis.Redis,
) -> RunStartResponse:
    """Spawn a profile-scoped run for one of the caller's sessions (contract 21.3).

    The child gets a short-lived run credential with no resume bound: it can only
    touch turns whose own resume_id is null, so a profile run cannot reach any
    resume.
    """
    _require_owned_session(db, user.id, session_id)
    return _spawn(
        db,
        user,
        resume_id=None,
        session_id=session_id,
        prompt=payload.prompt,
        execution_mode=_execution_mode(db, user, None),
        request=request,
        client=client,
    )


def _spawn(
    db: Session,
    user: CurrentUser,
    *,
    resume_id: str | None,
    session_id: str | None,
    prompt: str,
    execution_mode: str | None,
    request: Request,
    client: redis.Redis,
) -> RunStartResponse:
    model, endpoint, api_key = _resolve_model_config(db, user)

    if not _acquire_slot():
        limit = max(1, get_settings().agent_runner_max_concurrent)
        raise RateLimited(f"已有 {limit} 个运行在执行，请稍后重试")

    settings = get_settings()
    run_id = f"run_{uuid4().hex[:12]}"
    # The child receives a credential scoped to this resume instead of the
    # caller's session cookie. It is revoked when the child is reaped and expires
    # on its own if the backend dies first.
    secret = run_token.issue_run_token(
        client,
        owner_id=user.id,
        resume_id=resume_id,
        run_id=run_id,
        ttl_seconds=int(settings.agent_runner_timeout_seconds)
        + max(1, settings.agent_runner_token_slack_seconds),
        max_uses=max(1, settings.agent_runner_token_max_uses),
    )
    with _ACTIVE_LOCK:
        _ACTIVE_TOKENS[run_id] = (secret, client)
    try:
        command = _child_command(
            settings.agent_runner_command,
            resume_id=resume_id,
            prompt=prompt,
            execution_mode=execution_mode,
            session_id=session_id,
        )
        env = _child_env(
            base_url=str(request.base_url).rstrip("/"),
            token=secret,
            model=model,
            endpoint=endpoint,
            api_key=api_key,
        )
        log_dir = Path(settings.agent_runner_log_dir)
        log_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(log_dir, 0o700)
        log_path = log_dir / f"{run_id}.log"
        with open(log_path, "ab") as log_file:
            os.chmod(log_path, 0o600)
            proc = subprocess.Popen(
                command,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                env=env,
                close_fds=True,
                start_new_session=True,
            )
    except Exception:
        _release_slot(run_id)
        raise

    with _ACTIVE_LOCK:
        _ACTIVE_RUNS[run_id] = proc
    threading.Thread(
        target=_supervise,
        args=(run_id, proc, settings.agent_runner_timeout_seconds),
        daemon=True,
    ).start()
    return RunStartResponse(run_id=run_id, status="started")
