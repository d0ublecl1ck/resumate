"""把凭证从运行体打印的任何一行里抹掉（issue 4ff97）。

子进程的 stdout 被后端抓成 run log。provider 的错误正文可能带上模型 key，
这里在写 stdout 之前统一脱敏，保证日志里只可能出现已掩码的尾号。
"""

from __future__ import annotations

import re

# 兜底：任何形如 sk-xxxx 的密钥串即使不是当前配置的 key 也要抹掉。
_KEY_LIKE = re.compile(r"\bsk-[A-Za-z0-9._-]{6,}\b")
_BEARER = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}")
_AUTHORIZATION = re.compile(r"(?i)authorization\s*[:=]\s*\S+(?:\s+\S+)?")


def mask_key_hint(api_key: str | None) -> str | None:
    """把一把 key 压成 **** + 末四位，长度不足时返回 None。"""
    value = (api_key or "").strip()
    return f"****{value[-4:]}" if len(value) >= 4 else None


def redact_secrets(text: str, *, api_key: str | None = None) -> str:
    """Return text with the full key, Authorization header and bearer token removed."""
    result = text
    if api_key and api_key.strip():
        result = result.replace(api_key.strip(), mask_key_hint(api_key) or "****")
    result = _AUTHORIZATION.sub("[redacted]", result)
    result = _BEARER.sub("[redacted]", result)
    return _KEY_LIKE.sub("****", result)
