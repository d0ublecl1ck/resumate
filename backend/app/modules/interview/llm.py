"""面试模块的同步模型调用（与 app/modules/jd/parser.py 同一范式）。

只做三件事：解析用户已配置的模型配置、发一次无工具的结构化 chat completion、
把响应体解析成 JSON 对象。题目/追问/报告的字段校验由 service 负责。
HTTP 客户端、endpoint 解析、超时预算与状态码文案全部复用 settings 模块
（catalog.resolve_base_url / catalog.PROBE_TIMEOUT / catalog.safe_status_message），
不新建第二套 HTTP 客户端；日志只带 url、状态码与异常类型，绝不带 api key。
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.modules.settings import catalog
from app.modules.settings import dao as settings_dao
from app.modules.settings import service as settings_service
from app.shared.errors import (
    ModelNotConfigured,
    ModelOutputInvalid,
    UpstreamRejected,
    UpstreamTimeout,
)

logger = logging.getLogger(__name__)

# deepseek-flash 等推理型模型会把思考 token 计入 max_tokens，1600 会把 JSON 截断成
# finish_reason=length；4000 在保证结构化输出完整的同时仍远低于主流模型上限。
MAX_TOKENS = 4000
# 解析失败时最多把预算翻到这一上限再试一次（推理型模型的思考 token 也算在里面）。
MAX_TOKEN_CEILING = 16000
# OpenAI 兼容的结构化输出模式。部分自建网关不接受该参数，首次被拒后退化为
# 纯提示词约束，并把结论记在进程内，避免每个请求都白试一次。
JSON_RESPONSE_FORMAT: dict[str, str] = {"type": "json_object"}
_json_mode_state: dict[str, bool] = {"supported": True}


def _json_mode_enabled() -> bool:
    return _json_mode_state["supported"]


def _looks_like_json_mode_rejection(response: httpx.Response) -> bool:
    if response.status_code != 400:
        return False
    try:
        return "response_format" in response.text
    except Exception:  # pragma: no cover - 响应体不可读时按“不是该原因”处理
        return False


def _build_payload(
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    json_mode: bool,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = dict(JSON_RESPONSE_FORMAT)
    return payload


def _resolve_config(db: Session, owner_id: str) -> tuple[str, str, str, str]:
    """从用户级 settings 解析 (model, endpoint, api_key, provider)。"""
    row = settings_dao.get_by_owner(db, owner_id)
    config = (row.model_config if row is not None else {}) or {}
    model = str(config.get("model") or "").strip()
    endpoint = str(config.get("endpoint") or "").strip()
    provider = str(config.get("provider") or "").strip()
    api_key = settings_service.decrypt_api_key(config.get("apiKey"))
    if not api_key or not model:
        raise ModelNotConfigured("尚未配置模型密钥，请先在设置中完成模型配置")
    return model, endpoint, api_key, provider


def _post_with_retry(
    *,
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    timeout: httpx.Timeout | float,
    client: httpx.Client | None,
) -> httpx.Response:
    """仅对连接错误与超时重试一次；状态码失败不重试（重试不会改变结果）。"""
    for attempt in (1, 2):
        try:
            if client is None:
                with httpx.Client(timeout=timeout) as owned:
                    return owned.post(url, json=payload, headers=headers)
            return client.post(url, json=payload, headers=headers)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            if attempt == 1:
                logger.warning("面试模型连接失败，重试一次：url=%s error=%s", url, type(exc).__name__)
                continue
            logger.warning("面试模型连接失败：url=%s error=%s", url, type(exc).__name__)
            raise UpstreamRejected("无法连接模型服务，请检查 Endpoint 与网络") from exc
        except httpx.TimeoutException as exc:
            if attempt == 1:
                logger.warning("面试模型响应超时，重试一次：url=%s error=%s", url, type(exc).__name__)
                continue
            logger.warning("面试模型响应超时：url=%s error=%s", url, type(exc).__name__)
            raise UpstreamTimeout("模型响应超时，请稍后重试") from exc
        except httpx.HTTPError as exc:
            if attempt == 1:
                logger.warning("面试模型传输层异常，重试一次：url=%s error=%s", url, type(exc).__name__)
                continue
            logger.warning("面试模型传输层异常：url=%s error=%s", url, type(exc).__name__)
            raise UpstreamRejected("无法连接模型服务，请检查 Endpoint 与网络") from exc
    raise AssertionError("unreachable")


def _response_content(response: httpx.Response) -> tuple[str, str]:
    """取出 (content, finish_reason)；finish_reason=length 表示输出被预算截断。"""
    try:
        payload = response.json()
    except ValueError as exc:
        raise ModelOutputInvalid("模型返回无法解析，请重试") from exc
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise ModelOutputInvalid("模型返回无法解析，请重试")
    choice = choices[0]
    message = choice.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise ModelOutputInvalid("模型返回无法解析，请重试")
    finish = choice.get("finish_reason")
    return content, (finish if isinstance(finish, str) else "")


def extract_json_object(content: str) -> dict[str, Any]:
    """剥离 Markdown 代码块并取出第一个完整 JSON 对象。"""
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = stripped.lstrip("`").strip()
        if stripped[:4].lower() == "json":
            stripped = stripped[4:]
        stripped = stripped.strip()
        if stripped.endswith("```"):
            stripped = stripped[:-3]
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start < 0 or end <= start:
        raise ModelOutputInvalid("模型返回无法解析，请重试")
    try:
        data = json.loads(stripped[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ModelOutputInvalid("模型返回无法解析，请重试") from exc
    if not isinstance(data, dict):
        raise ModelOutputInvalid("模型返回无法解析，请重试")
    return data


def chat_json(
    db: Session,
    owner_id: str,
    *,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = MAX_TOKENS,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """发一次结构化模型调用并返回解析后的 JSON 对象。

    调用顺序：结构化输出（json_object）→ 输出被截断或解析失败时加倍预算重试一次。
    上游不接受 response_format 时自动降级为纯提示词约束，并记住该结论。
    """
    model, endpoint, api_key, provider = _resolve_config(db, owner_id)
    base_url = catalog.resolve_base_url(provider=provider, api_base=endpoint)
    url = base_url + catalog.CHAT_COMPLETIONS_PATH
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}

    def call(budget: int) -> httpx.Response:
        response = _post_with_retry(
            url=url,
            payload=_build_payload(
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=budget,
                json_mode=_json_mode_enabled(),
            ),
            headers=headers,
            timeout=catalog.PROBE_TIMEOUT,
            client=client,
        )
        if _looks_like_json_mode_rejection(response) and _json_mode_enabled():
            # 该网关不认 json_object：降级重发一次，并记住结论，后续请求不再带该参数。
            _json_mode_state["supported"] = False
            logger.warning("上游不支持 response_format=json_object，已降级为提示词约束：url=%s", url)
            response = _post_with_retry(
                url=url,
                payload=_build_payload(
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    max_tokens=budget,
                    json_mode=False,
                ),
                headers=headers,
                timeout=catalog.PROBE_TIMEOUT,
                client=client,
            )
        return response

    budget = max_tokens
    last_error: ModelOutputInvalid | None = None
    for attempt in (1, 2):
        response = call(budget)
        if response.status_code >= 400:
            logger.warning("面试模型上游拒绝：url=%s status=%s", url, response.status_code)
            raise UpstreamRejected(catalog.safe_status_message(response.status_code))
        content, finish_reason = _response_content(response)
        if finish_reason == "length":
            logger.warning("面试模型输出被 max_tokens 截断：url=%s budget=%s", url, budget)
            last_error = ModelOutputInvalid("模型输出被截断，请重试")
        else:
            try:
                return extract_json_object(content)
            except ModelOutputInvalid as exc:
                last_error = exc
        if attempt == 1:
            budget = min(budget * 2, MAX_TOKEN_CEILING)
            logger.warning("面试模型输出无法解析，加倍预算后重试一次：url=%s next_budget=%s", url, budget)
    raise last_error or ModelOutputInvalid("模型返回无法解析，请重试")
