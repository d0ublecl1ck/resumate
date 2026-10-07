"""POST /resumes/{id}/runs spawns the CLI runner (issue 83c41).

Every case points agent_runner_command at a stub executable: no real model and
no real resumate-agent install are involved.
"""

import time
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.agent import run_token, runner

import support


def _write_stub(tmp_path: Path, body: str) -> Path:
    script = tmp_path / "stub-runner.sh"
    script.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    script.chmod(0o755)
    return script


def _document() -> dict:
    return {
        "basics": {"fullName": "张沐", "headline": "", "email": "", "phone": "", "location": "", "links": []},
        "sections": [],
    }


def _create_resume(client: TestClient) -> dict:
    response = client.post(
        "/resumes",
        json={
            "title": "Runner 测试",
            "templateId": "tpl_classic",
            "targetRole": "测试",
            "tags": [],
            "document": _document(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _configure_model(client: TestClient, *, api_key: str = "sk-stub-secret") -> None:
    response = client.put(
        "/models/config",
        json={"model": "stub-model", "endpoint": "https://provider.test/v1", "apiKey": api_key},
    )
    assert response.status_code == 200, response.text


def _patch_runner(
    monkeypatch,
    tmp_path: Path,
    script: Path,
    *,
    timeout: float = 10.0,
    concurrency: int = 2,
) -> Path:
    settings = get_settings()
    log_dir = tmp_path / "logs"
    monkeypatch.setattr(settings, "agent_runner_command", str(script))
    monkeypatch.setattr(settings, "agent_runner_timeout_seconds", timeout)
    monkeypatch.setattr(settings, "agent_runner_log_dir", str(log_dir))
    monkeypatch.setattr(settings, "agent_runner_max_concurrent", concurrency)
    runner._reset_state()
    return log_dir


def _wait_for(predicate, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return predicate()


def test_run_requires_model_configuration(client: TestClient) -> None:
    resume = _create_resume(client)

    response = client.post(f"/resumes/{resume['id']}/runs", json={"prompt": "改简历"})

    assert response.status_code == 409, response.text
    assert response.json()["code"] == "MODEL_NOT_CONFIGURED"


def test_run_spawns_runner_with_env_credentials(
    client: TestClient,
    fake_redis,
    monkeypatch,
    tmp_path: Path,
) -> None:
    env_file = tmp_path / "child-env.txt"
    argv_file = tmp_path / "child-argv.txt"
    script = _write_stub(
        tmp_path,
        f'env | grep "^RESUME_AGENT_CORE_" | sort > "{env_file}"\n'
        f'printf "%s\\n" "$@" > "{argv_file}"\n'
        "echo runner-stub-ok\n",
    )
    log_dir = _patch_runner(monkeypatch, tmp_path, script)
    _configure_model(client)
    resume = _create_resume(client)
    session = client.post("/sessions", json={}).json()

    response = client.post(
        f"/resumes/{resume['id']}/runs",
        json={"prompt": "突出性能优化", "executionMode": "approval", "sessionId": session["id"]},
    )

    assert response.status_code == 202, response.text
    body = response.json()
    assert body["status"] == "started"
    assert body["runId"].startswith("run_")
    assert _wait_for(lambda: env_file.exists() and argv_file.exists()), "stub never ran"

    argv = argv_file.read_text(encoding="utf-8").splitlines()
    assert argv == [
        "--resume-id",
        resume["id"],
        "--prompt",
        "突出性能优化",
        "--execution-mode",
        "approval",
        "--session",
        session["id"],
    ]

    env_text = env_file.read_text(encoding="utf-8")
    env = dict(line.split("=", 1) for line in env_text.splitlines() if "=" in line)
    assert env["RESUME_AGENT_CORE_API_KEY"] == "sk-stub-secret"
    assert env["RESUME_AGENT_CORE_MODEL"] == "stub-model"
    # The child gets a run-scoped credential, never the caller's session cookie.
    token = env["RESUME_AGENT_CORE_TOKEN"]
    assert token.startswith(run_token.RUN_TOKEN_PREFIX)
    assert "RESUME_AGENT_CORE_SESSION_COOKIE" not in env
    assert "RESUME_AGENT_CORE_SESSION_COOKIE_NAME" not in env
    assert env["RESUME_AGENT_CORE_PROVIDER_BASE_URL"] == "https://provider.test/v1"
    assert env["RESUME_AGENT_CORE_BASE_URL"]
    # The child must not inherit the backend's own secrets.
    assert "DATABASE_URL" not in env
    assert "SETTINGS_SECRET_KEY" not in env

    assert _wait_for(lambda: list(log_dir.glob("*.log"))), "no run log written"
    log = next(log_dir.glob("*.log")).read_text(encoding="utf-8")
    assert "runner-stub-ok" in log
    assert "sk-stub-secret" not in log
    assert token not in log
    assert _wait_for(lambda: runner.active_run_count() == 0)
    # Reaping the child revokes the credential: nothing is left in the store.
    assert not runner._ACTIVE_TOKENS
    assert fake_redis.get(f"{run_token.RUN_TOKEN_KEY_PREFIX}{run_token.hash_run_token(token)}") is None


def test_run_timeout_kills_the_child(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    script = _write_stub(tmp_path, "sleep 30\n")
    _patch_runner(monkeypatch, tmp_path, script, timeout=0.3)
    _configure_model(client)
    resume = _create_resume(client)
    client.cookies.set("resumate_session", "sess-cookie-value")

    started = time.monotonic()
    response = client.post(f"/resumes/{resume['id']}/runs", json={"prompt": "改简历"})

    assert response.status_code == 202, response.text
    assert _wait_for(lambda: runner.active_run_count() == 0, timeout=6), "timed-out child was not reaped"
    assert time.monotonic() - started < 6


def test_run_rejects_when_concurrency_is_full(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    script = _write_stub(tmp_path, "sleep 1.2\n")
    _patch_runner(monkeypatch, tmp_path, script, timeout=10.0, concurrency=1)
    _configure_model(client)
    resume = _create_resume(client)
    client.cookies.set("resumate_session", "sess-cookie-value")

    first = client.post(f"/resumes/{resume['id']}/runs", json={"prompt": "第一次"})
    second = client.post(f"/resumes/{resume['id']}/runs", json={"prompt": "第二次"})

    assert first.status_code == 202, first.text
    assert second.status_code == 429, second.text
    assert second.json()["code"] == "RATE_LIMITED"
    assert _wait_for(lambda: runner.active_run_count() == 0, timeout=6)


def test_run_unknown_resume_is_404(client: TestClient, monkeypatch, tmp_path: Path) -> None:
    script = _write_stub(tmp_path, "echo nope\n")
    _patch_runner(monkeypatch, tmp_path, script)
    _configure_model(client)

    response = client.post("/resumes/res_missing/runs", json={"prompt": "改简历"})

    assert response.status_code == 404, response.text
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_run_rejects_pat_callers(session_clients) -> None:
    session = session_clients()
    registered = support.register_verified(session, email="runner-pat@example.com", password="password123", name="PAT")
    assert registered.status_code == 200, registered.text
    resume = _create_resume(session)
    token = session.post("/access/tokens", json={"name": "runner", "scopes": ["resume:write"]})
    assert token.status_code == 201, token.text

    pat = session_clients()
    response = pat.post(
        f"/resumes/{resume['id']}/runs",
        json={"prompt": "改简历"},
        headers={"Authorization": f"Bearer {token.json()['secretOnce']}"},
    )

    assert response.status_code == 403, response.text
    assert response.json()["code"] == "FORBIDDEN"


def _child_env(**overrides) -> dict[str, str]:
    """Build the runner's child environment with sane defaults for one case."""
    values = {
        "base_url": "http://127.0.0.1:8000/",
        "token": "rsm_run_stub",
        "model": "stub-model",
        "endpoint": "https://provider.test/v1",
        "api_key": "sk-stub-secret",
    }
    values.update(overrides)
    return runner._child_env(**values)


def _bypass_hosts(env: dict[str, str]) -> list[str]:
    return [host.strip() for host in env["NO_PROXY"].split(",") if host.strip()]


def test_child_env_bypasses_proxy_for_backend_and_loopback_forms() -> None:
    env = _child_env()

    # httpx reads NO_PROXY through the environment and the child does not
    # inherit the parent's bypass list, so both spellings must be set here.
    assert env["NO_PROXY"] == env["no_proxy"]
    bypass = _bypass_hosts(env)
    assert "localhost" in bypass
    assert "127.0.0.1" in bypass
    assert "::1" in bypass


def test_child_env_bypasses_proxy_for_base_url_host() -> None:
    env = _child_env(base_url="http://resumate.test:8000/")

    assert "resumate.test" in _bypass_hosts(env)


def test_child_env_bypasses_proxy_for_loopback_model_endpoint() -> None:
    env = _child_env(endpoint="http://127.0.0.1:8787/v1")

    assert "127.0.0.1" in _bypass_hosts(env)


def test_child_env_leaves_public_model_endpoint_on_the_proxy() -> None:
    env = _child_env(endpoint="https://api.deepseek.com/v1")

    assert "api.deepseek.com" not in _bypass_hosts(env)
    assert env["RESUME_AGENT_CORE_PROVIDER_BASE_URL"] == "https://api.deepseek.com/v1"
