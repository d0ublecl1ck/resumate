"""interview/llm.py 的 HTTP 边界：endpoint 拼接、Bearer 头、错误码映射。

不访问外网：用 httpx.MockTransport 兜住请求，仅验证契约与失败分类。
"""

import json

import httpx
import pytest
from sqlalchemy.orm import Session

from app.core.deps import CurrentUser
from app.modules.interview import llm as interview_llm
from app.modules.settings import service as settings_service
from app.modules.settings.schemas import ModelConfigUpdate
from app.shared.errors import ModelNotConfigured, ModelOutputInvalid, UpstreamRejected

USER = CurrentUser(
    id="user_test",
    display_name="测试用户",
    role="super_admin",
    roles=("super_admin",),
    permissions=frozenset(),
)


def configure_model(db: Session) -> None:
    settings_service.update_model_config(
        db,
        USER,
        ModelConfigUpdate(
            provider="openai",
            endpoint="http://example.test/v1",
            model="gpt-4o",
            api_key="sk-test",
        ),
    )


def test_chat_json_posts_to_configured_endpoint_with_bearer_key(db_session: Session) -> None:
    configure_model(db_session)
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["authorization"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "```json\n{\"ok\": true}\n```"}}]},
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        data = interview_llm.chat_json(db_session, USER.id, system_prompt="system", user_prompt="user", client=client)

    assert data == {"ok": True}
    assert seen["url"] == "http://example.test/v1/chat/completions"
    assert seen["authorization"] == "Bearer sk-test"
    body = seen["body"]
    assert isinstance(body, dict)
    assert body["model"] == "gpt-4o"
    assert body["messages"] == [
        {"role": "system", "content": "system"},
        {"role": "user", "content": "user"},
    ]


def test_chat_json_maps_upstream_rejection_without_leaking_body(db_session: Session) -> None:
    configure_model(db_session)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "invalid api key sk-test"})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(UpstreamRejected) as excinfo:
            interview_llm.chat_json(db_session, USER.id, system_prompt="s", user_prompt="u", client=client)

    message = str(excinfo.value)
    assert "sk-test" not in message
    assert "invalid api key" not in message


def test_chat_json_rejects_non_json_model_output(db_session: Session) -> None:
    configure_model(db_session)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "这不是 JSON"}}]})

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ModelOutputInvalid):
            interview_llm.chat_json(db_session, USER.id, system_prompt="s", user_prompt="u", client=client)


def test_chat_json_without_model_config_raises_stable_error(db_session: Session) -> None:
    with pytest.raises(ModelNotConfigured):
        interview_llm.chat_json(db_session, "user_without_settings", system_prompt="s", user_prompt="u")
