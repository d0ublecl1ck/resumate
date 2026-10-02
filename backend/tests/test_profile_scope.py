"""Profile-scoped agent turns and pending actions (issue fef83).

Scope decides what a turn operates on (resume vs profile); ownership still hangs
off the owner and, for profile work, the caller's own session. These cases ride
the stubbed current user unless noted.
"""

import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.modules.agent import run_token, runner

import support


def _document() -> dict:
    return {
        "basics": {"fullName": "张沐", "headline": "", "email": "", "phone": "", "location": "", "links": []},
        "sections": [],
    }


def _create_resume(client: TestClient) -> dict:
    response = client.post(
        "/resumes",
        json={
            "title": "作用域测试",
            "templateId": "tpl_classic",
            "targetRole": "测试",
            "tags": [],
            "document": _document(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_session(client: TestClient) -> str:
    response = client.post("/sessions", json={})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _section_op() -> dict:
    return {
        "op": "upsertSection",
        "section": {"id": "sec_scope", "kind": "experience", "title": "经历", "entries": []},
    }


def _configure_model(client: TestClient, *, api_key: str = "sk-stub-secret") -> None:
    response = client.put(
        "/models/config",
        json={"model": "stub-model", "endpoint": "https://provider.test/v1", "apiKey": api_key},
    )
    assert response.status_code == 200, response.text


def _write_stub(tmp_path: Path, body: str) -> Path:
    script = tmp_path / "profile-stub-runner.sh"
    script.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    script.chmod(0o755)
    return script


def _patch_runner(monkeypatch, tmp_path: Path, script: Path) -> Path:
    settings = get_settings()
    log_dir = tmp_path / "logs"
    monkeypatch.setattr(settings, "agent_runner_command", str(script))
    monkeypatch.setattr(settings, "agent_runner_timeout_seconds", 10.0)
    monkeypatch.setattr(settings, "agent_runner_log_dir", str(log_dir))
    runner._reset_state()
    return log_dir


def _wait_for(predicate, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return predicate()


def test_profile_turn_is_created_without_a_resume(client: TestClient) -> None:
    session_id = _create_session(client)

    response = client.post(
        "/turns",
        json={"scope": "profile", "sessionId": session_id, "message": "整理一下我的技能"},
    )

    assert response.status_code == 201, response.text
    turn = response.json()
    assert turn["scope"] == "profile"
    assert turn["resumeId"] is None
    assert turn["sessionId"] == session_id


def test_profile_turn_requires_a_session(client: TestClient) -> None:
    response = client.post("/turns", json={"scope": "profile"})

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_resume_scope_turn_requires_a_resume_id(client: TestClient) -> None:
    response = client.post("/turns", json={"scope": "resume"})

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_resume_path_endpoint_stays_resume_scoped(client: TestClient) -> None:
    resume = _create_resume(client)

    response = client.post(f"/resumes/{resume['id']}/turns", json={})

    assert response.status_code == 201, response.text
    turn = response.json()
    assert turn["scope"] == "resume"
    assert turn["resumeId"] == resume["id"]


def test_resume_patch_flow_rejects_a_profile_turn(client: TestClient) -> None:
    session_id = _create_session(client)
    turn = client.post("/turns", json={"scope": "profile", "sessionId": session_id}).json()

    response = client.post(f"/turns/{turn['id']}/patches:preview", json={"ops": [_section_op()]})

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "VALIDATION_FAILED"


def test_session_run_spawns_a_profile_runner(
    client: TestClient, monkeypatch, tmp_path: Path
) -> None:
    argv_file = tmp_path / "profile-argv.txt"
    env_file = tmp_path / "profile-env.txt"
    script = _write_stub(
        tmp_path,
        f'printf "%s\\n" "$@" > "{argv_file}"\n'
        f'env | grep "^RESUME_AGENT_CORE_" | sort > "{env_file}"\n'
        "echo profile-run-ok\n",
    )
    _patch_runner(monkeypatch, tmp_path, script)
    _configure_model(client)
    session_id = _create_session(client)
    client.cookies.set("resumate_session", "sess-cookie")

    response = client.post(f"/sessions/{session_id}/runs", json={"prompt": "整理我的技能"})

    assert response.status_code == 202, response.text
    assert response.json()["status"] == "started"
    assert _wait_for(
        lambda: argv_file.exists()
        and env_file.exists()
        and "RESUME_AGENT_CORE_TOKEN" in env_file.read_text(encoding="utf-8")
        and "--session" in argv_file.read_text(encoding="utf-8")
    ), "stub never wrote its argv/env"
    argv = argv_file.read_text(encoding="utf-8").splitlines()
    assert "--resume-id" not in argv
    assert argv[argv.index("--session") + 1] == session_id
    assert argv[argv.index("--prompt") + 1] == "整理我的技能"
    env = dict(line.split("=", 1) for line in env_file.read_text(encoding="utf-8").splitlines() if "=" in line)
    assert env["RESUME_AGENT_CORE_TOKEN"].startswith(run_token.RUN_TOKEN_PREFIX)
    assert _wait_for(lambda: runner.active_run_count() == 0)


def test_session_run_unknown_session_is_404(client: TestClient) -> None:
    response = client.post("/sessions/sess_missing/runs", json={"prompt": "整理我的技能"})

    assert response.status_code == 404, response.text
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"


def test_session_run_requires_a_human_session(session_clients, fake_redis) -> None:
    session = session_clients()
    registered = support.register_verified(
        session, email="profile-run-pat@example.com", password="password123", name="PAT 用户"
    )
    assert registered.status_code == 200, registered.text
    session_id = session.post("/sessions", json={}).json()["id"]
    token = session.post("/access/tokens", json={"name": "profile-run", "scopes": ["resume:write"]})
    assert token.status_code == 201, token.text
    pat_client = session_clients()

    response = pat_client.post(
        f"/sessions/{session_id}/runs",
        json={"prompt": "整理我的技能"},
        headers={"Authorization": f"Bearer {token.json()['secretOnce']}"},
    )

    assert response.status_code == 403, response.text
    assert response.json()["code"] == "FORBIDDEN"


def test_run_credential_cannot_start_a_session_run(session_clients, fake_redis) -> None:
    session = session_clients()
    registered = support.register_verified(
        session, email="profile-run-token@example.com", password="password123", name="Run 用户"
    )
    assert registered.status_code == 200, registered.text
    owner = session.get("/auth/me").json()["id"]
    session_id = session.post("/sessions", json={}).json()["id"]
    secret = run_token.issue_run_token(
        fake_redis, owner_id=owner, resume_id=None, run_id="run_profile", ttl_seconds=120, max_uses=10
    )
    runner_client = session_clients()

    response = runner_client.post(
        f"/sessions/{session_id}/runs",
        json={"prompt": "整理我的技能"},
        headers={"Authorization": f"Bearer {secret}"},
    )

    assert response.status_code == 403, response.text
    assert response.json()["code"] == "FORBIDDEN"
