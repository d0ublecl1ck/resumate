"""POST /jds:parse-text 的模型调用（issue fb67d）。

默认口径是「后端不直接调模型」：Agent run 由独立 runner 子进程承担，后端把
解密后的密钥交给子进程（见 app/modules/agent/runner.py）。本模块是**唯一的
同步例外**——用户在「新增 JD」里点一次「AI 整理」，需要的是一次短小、无工具、
无状态的结构化调用；为它再起一个 runner 子进程只会放大延迟与故障面，而且这条
路径不写数据库、不碰简历，风险面远小于 Agent run。

HTTP 客户端、endpoint 解析、超时预算与状态码文案全部复用 settings 模块
（catalog.resolve_base_url / catalog.PROBE_TIMEOUT / catalog.safe_status_message），
不新建第二套 HTTP 客户端；日志与错误响应只带 url、状态码与异常类型，绝不带
api key、Authorization 头或上游原始响应体。
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

from .schemas import ProposedJdExtracted, ProposedJdResponse

logger = logging.getLogger(__name__)

# 与前端 i18n 的 api.jd.note.text 保持同一句（issue fb67d 决策 3）：正文由用户
# 提供，note 只说明「这是 AI 整理的草案」，避免两边文案打架。
PARSE_NOTE = "由 AI 整理，请核对后创建。"

_PARSE_MAX_TOKENS = 800

_SYSTEM_PROMPT = (
    "你是招聘岗位信息结构化助手。把用户粘贴的岗位描述整理成一个 JSON 对象。"
    "只输出 JSON 本身，不要输出解释、Markdown 代码块或多余文字。字段：\n"
    "- role：岗位名称（字符串，尽量简短，例如「高级前端工程师」；判断不出留空字符串）\n"
    "- company：公司名（字符串，没有留空字符串）\n"
    "- tags：方向标签数组（字符串数组，0-6 个）\n"
    "- sourceUrl：原文里出现的第一个 http(s) 链接（没有留空字符串）\n"
    "- parseConfidence：本次抽取的置信度，0 到 1 之间的小数\n"
    "- extracted：抽取到的关键字段数组，每项 {\"label\": \"字段名\", \"value\": \"取值\"}\n"
    "不要编造原文中没有的信息；无法判断的字段留空。"
)


def _resolve_config(db: Session, owner_id: str) -> tuple[str, str, str, str]:
    """从用户级 settings 解析 (model, endpoint, api_key, provider)；写法对齐 runner。"""
    row = settings_dao.get_by_owner(db, owner_id)
    config = (row.model_config if row is not None else {}) or {}
    model = str(config.get("model") or "").strip()
    endpoint = str(config.get("endpoint") or "").strip()
    provider = str(config.get("provider") or "").strip()
    api_key = settings_service.decrypt_api_key(config.get("apiKey"))
    if not api_key or not model:
        raise ModelNotConfigured("尚未配置模型密钥，请先在设置中完成模型配置")
    return model, endpoint, api_key, provider


def _chat_completion(
    *,
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    timeout: httpx.Timeout | float,
    client: httpx.Client | None,
) -> httpx.Response:
    if client is None:
        with httpx.Client(timeout=timeout) as owned:
            return owned.post(url, json=payload, headers=headers)
    return client.post(url, json=payload, headers=headers)


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
            return _chat_completion(url=url, payload=payload, headers=headers, timeout=timeout, client=client)
        except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
            if attempt == 1:
                logger.warning("JD 解析连接失败，重试一次：url=%s error=%s", url, type(exc).__name__)
                continue
            logger.warning("JD 解析连接失败：url=%s error=%s", url, type(exc).__name__)
            raise UpstreamRejected("无法连接模型服务，请检查 Endpoint 与网络") from exc
        except httpx.TimeoutException as exc:
            if attempt == 1:
                logger.warning("JD 解析响应超时，重试一次：url=%s error=%s", url, type(exc).__name__)
                continue
            logger.warning("JD 解析响应超时：url=%s error=%s", url, type(exc).__name__)
            raise UpstreamTimeout("模型响应超时，请稍后重试") from exc
        except httpx.HTTPError as exc:
            if attempt == 1:
                logger.warning("JD 解析传输层异常，重试一次：url=%s error=%s", url, type(exc).__name__)
                continue
            logger.warning("JD 解析传输层异常：url=%s error=%s", url, type(exc).__name__)
            raise UpstreamRejected("无法连接模型服务，请检查 Endpoint 与网络") from exc
    raise AssertionError("unreachable")


def _response_content(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError as exc:
        raise ModelOutputInvalid("模型返回无法解析，请重试") from exc
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise ModelOutputInvalid("模型返回无法解析，请重试")
    message = choices[0].get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise ModelOutputInvalid("模型返回无法解析，请重试")
    return content


def _extract_json_object(content: str) -> dict[str, Any]:
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


def _as_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _coerce_confidence(value: Any) -> float:
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return 0.0
    return 0.0


def _to_response(data: dict[str, Any], *, text: str) -> ProposedJdResponse:
    tags_raw = data.get("tags")
    tags = (
        [tag.strip() for tag in tags_raw if isinstance(tag, str) and tag.strip()]
        if isinstance(tags_raw, list)
        else []
    )
    extracted: list[ProposedJdExtracted] = []
    extracted_raw = data.get("extracted")
    if isinstance(extracted_raw, list):
        for item in extracted_raw:
            if not isinstance(item, dict):
                continue
            label = _as_text(item.get("label"))
            value = _as_text(item.get("value"))
            if label and value:
                extracted.append(ProposedJdExtracted(label=label, value=value))
    return ProposedJdResponse(
        role=_as_text(data.get("role")),
        company=_as_text(data.get("company")) or None,
        tags=tags,
        # 正文始终用用户原始文本：模型只负责抽取字段，不允许改写或截断岗位描述。
        body=text.strip(),
        source_url=_as_text(data.get("sourceUrl")) or None,
        extracted=extracted,
        parse_confidence=max(0.0, min(1.0, _coerce_confidence(data.get("parseConfidence")))),
        note=PARSE_NOTE,
        input_source="text",
    )


def parse_jd_text(
    db: Session,
    owner_id: str,
    *,
    text: str,
    client: httpx.Client | None = None,
) -> ProposedJdResponse:
    model, endpoint, api_key, provider = _resolve_config(db, owner_id)
    base_url = catalog.resolve_base_url(provider=provider, api_base=endpoint)
    url = base_url + catalog.CHAT_COMPLETIONS_PATH
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        "temperature": 0,
        "max_tokens": _PARSE_MAX_TOKENS,
    }
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    response = _post_with_retry(
        url=url,
        payload=payload,
        headers=headers,
        timeout=catalog.PROBE_TIMEOUT,
        client=client,
    )
    if response.status_code >= 400:
        logger.warning("JD 解析上游拒绝：url=%s status=%s", url, response.status_code)
        raise UpstreamRejected(catalog.safe_status_message(response.status_code))
    return _to_response(_extract_json_object(_response_content(response)), text=text)
