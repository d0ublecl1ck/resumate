"""阿里云百炼（DashScope）Qwen-TTS 语音合成客户端。

真实链路（与官方 RESTful API 一致，测试用 httpx.MockTransport 写死契约）：
1. POST {base}/services/aigc/multimodal-generation/generation
   请求体 {"model": model, "input": {"text": text, "voice": voice}}；
2. 响应 output.audio.url 是带签名的临时 OSS URL（Expires / expires_at，几分钟内过期）；
3. GET 该临时 URL 取回音频字节。

为什么由服务端取回音频、而不是把临时 URL 透给浏览器：签名 URL 是「凭据 + 有效期」的
一过性资源，直接发给浏览器既会把签名暴露给前端，又无法在服务端统一处理「取回时已
过期」的重试与错误映射；服务端取回后只回传音频字节，过期/失败都收敛成稳定错误码。

与 ASR 客户端一致：音频只在内存中流转，本模块不写任何临时文件；任何上游失败都被
映射成仓库既有错误码（UpstreamTimeout / UpstreamRejected / ModelOutputInvalid），
且绝不把上游原始报错、URL 签名或凭证回显给前端。
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.shared.errors import ModelOutputInvalid, UpstreamRejected, UpstreamTimeout

PROVIDER = "dashscope"
DEFAULT_MODEL = "qwen3-tts-flash"
DEFAULT_VOICE = "Cherry"
# qwen3-tts-flash 当前只产出 wav（24kHz 单声道）临时链接，没有可选的输出容器参数；
# 契约保留 format 字段但只接受 wav，避免对外声称支持并不存在的格式。
SUPPORTED_FORMATS = ("wav",)

GENERATION_PATH = "/services/aigc/multimodal-generation/generation"

# 合成文本上限（字符）：官方限制为 512 token，这里留出余量；超限由上游返回 400，
# 映射成 UPSTREAM_REJECTED，不做静默截断。
MAX_TEXT_CHARS = 2000

REQUEST_TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=30.0, pool=10.0)
DEFAULT_CONTENT_TYPE = "audio/wav"

# 对外兜底文案：不含上游原文、不含 URL 签名、不含凭证。
_MESSAGE_INVALID_KEY = "语音播报服务拒绝凭证，请检查 API Key 与地域配置"
_MESSAGE_RATE_LIMITED = "语音播报服务限流，请稍后重试"
_MESSAGE_UNAVAILABLE = "语音播报服务暂时不可用，请稍后重试"
_MESSAGE_CONNECT = "无法连接语音播报服务，请检查网络"
_MESSAGE_TIMEOUT = "语音播报超时，请稍后重试"
_MESSAGE_PARSE = "语音播报返回内容无法解析"
_MESSAGE_EXPIRED = "语音播报音频链接已取不到，请重试"
_MESSAGE_EMPTY_AUDIO = "语音播报返回的音频为空"


@dataclass(frozen=True, slots=True)
class SynthesizedAudio:
    """一次合成的结果：内存中的音频字节与容器类型。"""

    audio: bytes
    content_type: str
    provider: str = PROVIDER


def _raise_for_status(status: int) -> None:
    """把上游 HTTP 状态映射成稳定错误码，绝不回显上游响应体。"""
    if status in (401, 403):
        raise UpstreamRejected(_MESSAGE_INVALID_KEY)
    if status == 429:
        raise UpstreamRejected(_MESSAGE_RATE_LIMITED)
    if status >= 500:
        raise UpstreamRejected(_MESSAGE_UNAVAILABLE)
    raise UpstreamRejected(f"语音播报服务拒绝请求（HTTP {status}）")


def _request_json(http: httpx.Client, url: str, api_key: str, body: dict[str, Any]) -> dict[str, Any]:
    try:
        response = http.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=body,
        )
    except httpx.TimeoutException as exc:
        raise UpstreamTimeout(_MESSAGE_TIMEOUT) from exc
    except httpx.HTTPError as exc:
        raise UpstreamRejected(_MESSAGE_CONNECT) from exc
    if response.status_code >= 400:
        _raise_for_status(response.status_code)
    try:
        payload = response.json()
    except ValueError as exc:
        raise ModelOutputInvalid(_MESSAGE_PARSE) from exc
    if not isinstance(payload, dict):
        raise ModelOutputInvalid(_MESSAGE_PARSE)
    return payload


def parse_synthesis(payload: dict[str, Any]) -> tuple[str, int | None]:
    """从合成响应里取出临时音频 URL 与过期时间戳（秒）；缺失或非法即报解析失败。"""
    output = payload.get("output")
    audio = output.get("audio") if isinstance(output, dict) else None
    url = audio.get("url") if isinstance(audio, dict) else None
    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        raise ModelOutputInvalid(_MESSAGE_PARSE)
    expires_at = audio.get("expires_at")
    if isinstance(expires_at, bool) or not isinstance(expires_at, (int, float)):
        expires_at = None
    else:
        expires_at = int(expires_at)
    return url, expires_at


def _content_type(response: httpx.Response) -> str:
    header = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
    if header.startswith("audio/"):
        return header
    return DEFAULT_CONTENT_TYPE


def _download_audio(http: httpx.Client, url: str) -> tuple[bytes, str]:
    """取回临时 URL 指向的音频字节；URL 过期/被拒绝映射成可重试的稳定错误码。"""
    try:
        response = http.get(url)
    except httpx.TimeoutException as exc:
        raise UpstreamTimeout(_MESSAGE_TIMEOUT) from exc
    except httpx.HTTPError as exc:
        raise UpstreamRejected(_MESSAGE_CONNECT) from exc
    if response.status_code in (401, 403, 404, 410):
        # 签名 URL 过期或被拒绝：给可重试的稳定文案，不回显签名。
        raise UpstreamRejected(_MESSAGE_EXPIRED)
    if response.status_code >= 400:
        _raise_for_status(response.status_code)
    audio = response.content
    if not audio:
        raise ModelOutputInvalid(_MESSAGE_EMPTY_AUDIO)
    return audio, _content_type(response)


def synthesize(
    *,
    text: str,
    api_key: str,
    base_url: str,
    model: str = DEFAULT_MODEL,
    voice: str = DEFAULT_VOICE,
    timeout: httpx.Timeout | float = REQUEST_TIMEOUT,
    client: httpx.Client | None = None,
    now: float | None = None,
) -> SynthesizedAudio:
    """把一段文本合成语音并取回音频字节。

    传入 client（测试用 httpx.MockTransport）时由调用方负责关闭；未传入时本函数自建
    并在结束时关闭。任何路径都不会把音频写到磁盘。临时 URL 在响应里可能已带
    expires_at：先做一次本地过期判断，再在下载时把 401/403/404/410 映射成过期错误。
    """
    base = base_url.rstrip("/")
    owns_client = client is None
    http = client if client is not None else httpx.Client(timeout=timeout)
    try:
        payload = _request_json(
            http,
            base + GENERATION_PATH,
            api_key,
            {"model": model, "input": {"text": text, "voice": voice}},
        )
        url, expires_at = parse_synthesis(payload)
        current = time.time() if now is None else now
        if expires_at is not None and expires_at <= current:
            raise UpstreamRejected(_MESSAGE_EXPIRED)
        audio, content_type = _download_audio(http, url)
        return SynthesizedAudio(audio=audio, content_type=content_type)
    finally:
        if owns_client:
            http.close()
