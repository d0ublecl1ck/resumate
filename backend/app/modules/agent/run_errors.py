"""结构化、脱敏的运行失败（issue 4ff97）。

运行体的终态 ErrorEvent 过去只落在子进程 stdout 与事件流里：轮次随后以普通 cancelled
结算，界面据此判成 turn_closed，用户看不到任何失败原因。这里把错误归一成可查询的结构，
并保证完整 key、Authorization 头与堆栈永远不会进入响应或数据库。

只允许一种凭证形式进入用户可见字段：已掩码的尾号（例如 ****be21）。
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Literal

from pydantic import Field

from app.shared.schemas import ApiModel

RunErrorCategory = Literal["auth", "timeout", "quota", "runner", "approval", "unknown"]

_MAX_MESSAGE_CHARS = 500
_REDACTED = "[已隐藏]"

# 运行体可以送来的机器码；没有命中的码再按上游文案分类。
_AUTH_CODES = frozenset({"MODEL_AUTH", "MODEL_AUTH_FAILED", "UNAUTHORIZED", "INVALID_API_KEY"})
_TIMEOUT_CODES = frozenset({"TIMEOUT", "RUN_TIMEOUT", "NETWORK_TIMEOUT", "CONNECT_TIMEOUT"})
_QUOTA_CODES = frozenset({"BUDGET_EXCEEDED", "QUOTA_EXCEEDED", "INSUFFICIENT_QUOTA", "RATE_LIMITED"})
_RUNNER_CODES = frozenset({"RUNNER_EXIT", "RUNNER_CRASH", "RUNNER_KILLED"})
_APPROVAL_CODES = frozenset({"APPROVAL_CONFLICT", "PENDING_ACTION_CONFLICT"})

_AUTH_PATTERNS = (
    re.compile(r"\b401\b"),
    re.compile(r"\b403\b"),
    re.compile(r"authentication fails", re.IGNORECASE),
    re.compile(r"unauthori[sz]ed", re.IGNORECASE),
    re.compile(r"api key[^.]*invalid", re.IGNORECASE),
    re.compile(r"invalid api key", re.IGNORECASE),
)
_TIMEOUT_PATTERNS = (
    re.compile(r"timeout", re.IGNORECASE),
    re.compile(r"timed out", re.IGNORECASE),
    re.compile(r"deadline exceeded", re.IGNORECASE),
)
_QUOTA_PATTERNS = (
    re.compile(r"\b429\b"),
    re.compile(r"rate ?limit", re.IGNORECASE),
    re.compile(r"quota", re.IGNORECASE),
    re.compile(r"insufficient", re.IGNORECASE),
)

# 已掩码尾号：上游返回的 ****be21 这类形式是唯一允许透传的凭证信息。
_MASKED_HINT = re.compile(r"\*{2,}[A-Za-z0-9._-]{2,12}")
# 兜底：任何形如 sk-xxxx 的密钥串即使未被配置命中也要抹掉。
_KEY_LIKE = re.compile(r"\bsk-[A-Za-z0-9._-]{6,}\b")
_AUTHORIZATION_HEADER = re.compile(r"(?i)authorization\s*[:=]\s*\S+(?:\s+\S+)?")
_BEARER_TOKEN = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}")
_TRACEBACK_LINE = re.compile(r"(?i)^\s*traceback\b")
_STACK_FILE_LINE = re.compile(r'(?i)^\s*file\s+"')
_STACK_AT_LINE = re.compile(r"^\s*at\s+")


class RunErrorInput(ApiModel):
    """运行体上报的终态失败；message 允许包含上游已掩码的 key 尾号。"""

    code: str = Field(default="", max_length=64)
    message: str = Field(default="", max_length=2000)
    detail: str | None = Field(default=None, max_length=200)


class RunErrorResponse(ApiModel):
    """一次运行失败的归一化投影；只有掩码尾号，没有任何原始凭证。"""

    code: str
    category: RunErrorCategory
    message: str
    provider: str | None = None
    model: str | None = None
    key_hint: str | None = None
    at: datetime


def mask_key_hint(api_key: str | None) -> str | None:
    """把一把 key 压成 **** + 末四位，长度不足时返回 None。"""
    value = (api_key or "").strip()
    if len(value) < 4:
        return None
    return f"****{value[-4:]}"


def extract_key_hint(message: str) -> str | None:
    """从上游文案里取回已经掩码的尾号（例如 ****be21）。"""
    match = _MASKED_HINT.search(message or "")
    return match.group(0) if match else None


def _strip_stack(text: str) -> str:
    """丢掉 traceback / 栈帧行：堆栈不进入任何用户可见字段。"""
    kept = []
    for line in text.splitlines():
        stripped = line.strip()
        if _TRACEBACK_LINE.match(stripped) or _STACK_FILE_LINE.match(stripped) or _STACK_AT_LINE.match(stripped):
            continue
        kept.append(line)
    return "\n".join(kept)


def sanitize_message(message: str, *, api_key: str | None = None) -> str:
    """把上游错误压成一行安全文案：不含完整 key、Authorization 头与堆栈。"""
    text = _strip_stack(message or "")
    hint = mask_key_hint(api_key)
    if api_key and api_key.strip():
        text = text.replace(api_key.strip(), hint or "****")
    text = _AUTHORIZATION_HEADER.sub(_REDACTED, text)
    text = _BEARER_TOKEN.sub(_REDACTED, text)
    text = _KEY_LIKE.sub("****", text)
    collapsed = " ".join(text.split())
    if len(collapsed) > _MAX_MESSAGE_CHARS:
        collapsed = collapsed[:_MAX_MESSAGE_CHARS] + "..."
    return collapsed


def classify(code: str, message: str) -> RunErrorCategory:
    """把机器码 + 上游文案归到用户能理解的失败类别。"""
    upper = (code or "").strip().upper()
    if upper in _AUTH_CODES:
        return "auth"
    if upper in _TIMEOUT_CODES:
        return "timeout"
    if upper in _QUOTA_CODES:
        return "quota"
    if upper in _RUNNER_CODES:
        return "runner"
    if upper in _APPROVAL_CODES:
        return "approval"
    if any(pattern.search(message) for pattern in _AUTH_PATTERNS):
        return "auth"
    if any(pattern.search(message) for pattern in _TIMEOUT_PATTERNS):
        return "timeout"
    if any(pattern.search(message) for pattern in _QUOTA_PATTERNS):
        return "quota"
    return "unknown"


def build_run_error(
    payload: RunErrorInput,
    *,
    provider: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    code: str | None = None,
) -> RunErrorResponse:
    """归一化一条失败：先脱敏，再分类，最后补齐 provider/model 与 key 尾号。"""
    message = sanitize_message(payload.message, api_key=api_key)
    resolved_code = (code or payload.code or "RUN_FAILED").strip() or "RUN_FAILED"
    key_hint = extract_key_hint(message) or mask_key_hint(api_key)
    return RunErrorResponse(
        code=resolved_code,
        category=classify(resolved_code, message),
        message=message,
        provider=(provider or "").strip() or None,
        model=(model or "").strip() or None,
        key_hint=key_hint,
        at=datetime.now(timezone.utc),
    )
