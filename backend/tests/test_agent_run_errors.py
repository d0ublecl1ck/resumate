"""运行失败必须结构化、可查询、且绝不回显密钥（issue 4ff97）。

运行体把终态 ErrorEvent 只写进了子进程 stdout 日志，轮次随后以普通 cancelled 结算，
界面据此判成 turn_closed，用户看不到任何失败原因。这些用例钉住四件事：错误被持久化、
被分类、被脱敏、以及「完整 key / Authorization / 堆栈绝不出现在响应与库中」。
"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.modules.agent import run_token, runner, service
from app.modules.agent.schemas import TurnCreateRequest

FULL_KEY = "sk-live-abcdefbe21"
UPSTREAM_401 = (
    "model provider returned HTTP 401: Authentication Fails, "
    "Your api key: ****be21 is invalid (request_id: req_01)"
)


def _document() -> dict:
    return {
        "basics": {"fullName": "黄鹏星", "headline": "", "email": "", "phone": "", "location": "", "links": []},
        "sections": [],
    }


def _create_resume(client: TestClient) -> dict:
    response = client.post(
        "/resumes",
        json={
            "title": "运行错误测试",
            "templateId": "tpl_classic",
            "targetRole": "测试",
            "tags": [],
            "document": _document(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _configure_model(client: TestClient, *, api_key: str = FULL_KEY) -> None:
    response = client.put(
        "/models/config",
        json={
            "provider": "deepseek",
            "model": "deepseek-flash",
            "endpoint": "https://api.deepseek.com/v1",
            "apiKey": api_key,
        },
    )
    assert response.status_code == 200, response.text


def _begin(client: TestClient, resume_id: str, **body) -> dict:
    response = client.post(f"/resumes/{resume_id}/turns", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def _report(client: TestClient, turn_id: str, **body):
    return client.post(f"/turns/{turn_id}/run-errors", json=body)


def test_run_error_is_persisted_classified_and_masked(client: TestClient) -> None:
    resume = _create_resume(client)
    _configure_model(client)
    turn = _begin(client, resume["id"], message="我叫黄鹏星")

    response = _report(client, turn["id"], code="MODEL_ERROR", message=UPSTREAM_401)
    assert response.status_code == 200, response.text

    body = client.get(f"/turns/{turn['id']}").json()
    error = body["runError"]
    # 类别 + provider/model + 出问题那把 key 的尾号，用户据此能判断是哪把 key。
    assert error["category"] == "auth"
    assert error["provider"] == "deepseek"
    assert error["model"] == "deepseek-flash"
    assert error["keyHint"] == "****be21"
    assert "****be21" in error["message"]
    # 负向断言：完整 key / Authorization 头 / 堆栈一律不得出现。
    raw = response.text + client.get(f"/turns/{turn['id']}").text
    assert FULL_KEY not in raw
    assert "Authorization" not in raw
    assert "Traceback" not in raw


def test_run_error_strips_full_key_authorization_and_stack(client: TestClient) -> None:
    resume = _create_resume(client)
    _configure_model(client)
    turn = _begin(client, resume["id"], message="改简历")
    poisoned = (
        f"Authorization: Bearer {FULL_KEY}\n"
        "model provider returned HTTP 401: api key ****be21 is invalid\n"
        'Traceback (most recent call last):\n  File "provider.py", line 42, in complete\n'
        f"    raise RuntimeError('{FULL_KEY}')"
    )

    response = _report(client, turn["id"], code="MODEL_ERROR", message=poisoned)
    assert response.status_code == 200, response.text

    stored = client.get(f"/turns/{turn['id']}").json()["runError"]
    assert stored["category"] == "auth"
    assert stored["keyHint"] == "****be21"
    assert FULL_KEY not in stored["message"]
    assert "Authorization" not in stored["message"]
    assert "Traceback" not in stored["message"]
    assert 'File "' not in stored["message"]


def test_run_error_classifies_budget_as_quota(client: TestClient) -> None:
    resume = _create_resume(client)
    _configure_model(client)
    turn = _begin(client, resume["id"], message="改简历")

    assert _report(
        client,
        turn["id"],
        code="BUDGET_EXCEEDED",
        message="max_tokens (20000) exhausted",
        detail="max_tokens",
    ).status_code == 200

    error = client.get(f"/turns/{turn['id']}").json()["runError"]
    assert error["category"] == "quota"
    assert "max_tokens" in error["message"]


def test_run_error_classifies_timeout(client: TestClient) -> None:
    resume = _create_resume(client)
    _configure_model(client)
    turn = _begin(client, resume["id"], message="改简历")

    _report(client, turn["id"], code="MODEL_ERROR", message="ConnectTimeout: provider did not answer")
    error = client.get(f"/turns/{turn['id']}").json()["runError"]
    assert error["category"] == "timeout"
    # 上游超时文案里没有 key 尾号时，用当前配置这把 key 的尾号兜底。
    assert error["keyHint"] == "****be21"


def test_run_error_keeps_first_terminal_error(client: TestClient) -> None:
    """先落的终态错误不能被后到的更宽泛错误覆盖。"""
    resume = _create_resume(client)
    _configure_model(client)
    turn = _begin(client, resume["id"], message="改简历")

    _report(client, turn["id"], code="MODEL_ERROR", message=UPSTREAM_401)
    _report(client, turn["id"], code="RUNNER_EXIT", message="runner exited with code 1")

    error = client.get(f"/turns/{turn['id']}").json()["runError"]
    assert error["category"] == "auth"


def test_cancel_after_run_error_keeps_the_error(client: TestClient) -> None:
    """失败后的 cancel 不能再把错误抹掉，否则又回到静默取消。"""
    resume = _create_resume(client)
    _configure_model(client)
    turn = _begin(client, resume["id"], message="改简历")
    _report(client, turn["id"], code="MODEL_ERROR", message=UPSTREAM_401)

    cancelled = client.post(f"/turns/{turn['id']}/cancel", json={"reason": "runtime aborted: MODEL_ERROR"})
    assert cancelled.status_code == 200, cancelled.text

    body = client.get(f"/turns/{turn['id']}").json()
    assert body["state"] == "cancelled"
    assert body["runError"]["category"] == "auth"
    assert body["runError"]["keyHint"] == "****be21"


def test_record_run_failure_marks_the_open_turn(client: TestClient, db_session: Session) -> None:
    """进程异常退出没有 ErrorEvent：supervisor 用 run_id 兜底落错误。"""
    resume = _create_resume(client)
    _configure_model(client)
    run_user = CurrentUser(
        id="user_test",
        display_name="运行体",
        role="user",
        roles=("user",),
        permissions=frozenset({"resume:read", "resume:write"}),
        auth_kind="run",
        run_id="run_supervisor_case",
    )
    turn = service.begin_turn(db_session, run_user, resume["id"], TurnCreateRequest(message="改简历"))
    db_session.commit()

    marked = service.record_run_failure(
        db_session, "run_supervisor_case", code="RUNNER_EXIT", message="runner exited with code 1"
    )
    db_session.commit()

    assert marked is True
    body = client.get(f"/turns/{turn.id}").json()
    assert body["state"] == "cancelled"
    assert body["runError"]["category"] == "runner"


def test_run_token_may_report_run_errors() -> None:
    assert run_token.endpoint_allowed("POST", "/turns/turn_1/run-errors")


def test_exit_failure_classifies_timeout_and_crash() -> None:
    assert runner._exit_failure(False, 0) is None
    crash = runner._exit_failure(False, 1)
    assert crash is not None and crash[0] == "RUNNER_EXIT"
    timeout = runner._exit_failure(True, -9)
    assert timeout is not None and timeout[0] == "RUN_TIMEOUT"


def test_settle_child_failure_only_writes_on_a_bad_exit(monkeypatch) -> None:
    calls: list[tuple[str, str]] = []

    def fake_mark(run_id: str, code: str, message: str) -> None:
        calls.append((run_id, code))

    monkeypatch.setattr(runner, "_mark_run_failed", fake_mark)

    runner._settle_child_failure("run_ok", False, 0)
    assert calls == []
    runner._settle_child_failure("run_crash", False, 3)
    runner._settle_child_failure("run_slow", True, -9)
    assert calls == [("run_crash", "RUNNER_EXIT"), ("run_slow", "RUN_TIMEOUT")]
