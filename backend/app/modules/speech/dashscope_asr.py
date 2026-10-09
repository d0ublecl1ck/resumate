"""阿里云百炼（DashScope）Paraformer 录音文件识别客户端。

真实链路（与官方 RESTful API 一致，测试用 httpx.MockTransport 写死契约）：
1. GET  {base}/uploads?action=getPolicy&model=<model>      取得临时上传凭证；
2. POST <upload_host>（multipart）                          上传音频，得到 oss:// 临时 URL；
3. POST {base}/services/audio/asr/transcription            提交异步转写任务（X-DashScope-Async: enable）；
4. GET  {base}/tasks/{task_id}                             轮询任务，直到成功 / 失败 / 超时；
5. GET  <transcription_url>                                拉取带词/句级时间戳的识别结果。

音频**不落盘**：调用方传入内存中的 bytes，本模块只把它塞进 multipart 请求体，
不写临时文件、不落库、不保留任何副本；调用方也无需清理。

任何上游失败都被映射成仓库既有错误码（UpstreamTimeout / UpstreamRejected /
ModelOutputInvalid），且**绝不把上游原始报错或凭证回显给前端**：对外只给稳定的
中文兜底文案，日志里也只记 URL 与异常类型。
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Callable, Iterable

import httpx

from app.shared.errors import ModelOutputInvalid, UpstreamRejected, UpstreamTimeout

PROVIDER = "dashscope"
DEFAULT_MODEL = "paraformer-v2"
DEFAULT_REGION = "cn-beijing"
# 各地域接入域名不同，API Key 也不能跨地域混用（官方文档「各地域接入信息」）。
REGION_BASE_URLS: dict[str, str] = {
    "cn-beijing": "https://dashscope.aliyuncs.com/api/v1",
    "ap-southeast-1": "https://dashscope-intl.aliyuncs.com/api/v1",
}

UPLOADS_PATH = "/uploads"
SUBMIT_PATH = "/services/audio/asr/transcription"
TASKS_PATH = "/tasks"

# 单次转写的网络预算：连接/读/写分开，短音频不应卡在整请求超时上。
REQUEST_TIMEOUT = httpx.Timeout(connect=10.0, read=60.0, write=60.0, pool=10.0)
POLL_INTERVAL_SECONDS = 1.0
POLL_TIMEOUT_SECONDS = 120.0

_POLICY_FIELDS = (
    "upload_dir",
    "upload_host",
    "oss_access_key_id",
    "signature",
    "policy",
    "x_oss_object_acl",
    "x_oss_forbid_overwrite",
)

# 对外兜底文案：不含上游原文、不含凭证、不含请求体。
_MESSAGE_INVALID_KEY = "语音识别服务拒绝凭证，请检查 API Key 与地域配置"
_MESSAGE_RATE_LIMITED = "语音识别服务限流，请稍后重试"
_MESSAGE_UNAVAILABLE = "语音识别服务暂时不可用，请稍后重试"
_MESSAGE_CONNECT = "无法连接语音识别服务，请检查网络"
_MESSAGE_TIMEOUT = "语音识别超时，请稍后重试"
_MESSAGE_PARSE = "语音识别返回内容无法解析"
_MESSAGE_TASK_FAILED = "语音识别任务失败，请稍后重试"


@dataclass(frozen=True, slots=True)
class TimedUnit:
    """一个词级或句级时间戳单元；begin/end 为相对音频开头的毫秒。"""

    text: str
    begin_ms: int
    end_ms: int


@dataclass(frozen=True, slots=True)
class TranscriptionResult:
    transcript: str
    duration_seconds: float
    words: tuple[TimedUnit, ...]
    provider: str = PROVIDER


def resolve_base_url(*, region: str | None, endpoint: str | None) -> str:
    """显式 Endpoint 优先；否则按地域取官方默认域名。"""
    override = (endpoint or "").strip().rstrip("/")
    if override:
        return override
    key = (region or DEFAULT_REGION).strip() or DEFAULT_REGION
    return REGION_BASE_URLS.get(key, REGION_BASE_URLS[DEFAULT_REGION])


def _raise_for_status(status: int) -> None:
    """把上游 HTTP 状态映射成稳定错误码，绝不回显上游响应体。"""
    if status in (401, 403):
        raise UpstreamRejected(_MESSAGE_INVALID_KEY)
    if status == 429:
        raise UpstreamRejected(_MESSAGE_RATE_LIMITED)
    if status >= 500:
        raise UpstreamRejected(_MESSAGE_UNAVAILABLE)
    raise UpstreamRejected(f"语音识别服务拒绝请求（HTTP {status}）")


def _request_json(
    http: httpx.Client,
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        if method == "GET":
            response = http.get(url, headers=headers, params=params)
        else:
            response = http.post(url, headers=headers, params=params, json=json_body)
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


def _get_upload_policy(http: httpx.Client, base_url: str, api_key: str, model: str) -> dict[str, str]:
    payload = _request_json(
        http,
        "GET",
        base_url + UPLOADS_PATH,
        headers={"Authorization": f"Bearer {api_key}"},
        params={"action": "getPolicy", "model": model},
    )
    data = payload.get("data")
    if not isinstance(data, dict) or any(not isinstance(data.get(field), str) or not data[field] for field in _POLICY_FIELDS):
        raise ModelOutputInvalid(_MESSAGE_PARSE)
    return {field: data[field] for field in _POLICY_FIELDS}


def _upload_audio(
    http: httpx.Client,
    policy: dict[str, str],
    audio: bytes,
    filename: str,
    content_type: str,
) -> str:
    key = f"{policy['upload_dir']}/{filename}"
    files = {
        "OSSAccessKeyId": (None, policy["oss_access_key_id"]),
        "Signature": (None, policy["signature"]),
        "policy": (None, policy["policy"]),
        "x-oss-object-acl": (None, policy["x_oss_object_acl"]),
        "x-oss-forbid-overwrite": (None, policy["x_oss_forbid_overwrite"]),
        "key": (None, key),
        "success_action_status": (None, "200"),
        "file": (filename, audio, content_type or "application/octet-stream"),
    }
    try:
        response = http.post(policy["upload_host"], files=files)
    except httpx.TimeoutException as exc:
        raise UpstreamTimeout(_MESSAGE_TIMEOUT) from exc
    except httpx.HTTPError as exc:
        raise UpstreamRejected(_MESSAGE_CONNECT) from exc
    if response.status_code >= 400:
        _raise_for_status(response.status_code)
    # 音频字节只在上面的 multipart 请求体里出现过，随后即被释放，不落盘。
    return f"oss://{key}"


def _submit_task(
    http: httpx.Client,
    base_url: str,
    api_key: str,
    model: str,
    oss_url: str,
    language_hints: Iterable[str] | None,
) -> str:
    parameters: dict[str, Any] = {"channel_id": [0]}
    if language_hints:
        parameters["language_hints"] = list(language_hints)
    body = {"model": model, "input": {"file_urls": [oss_url]}, "parameters": parameters}
    payload = _request_json(
        http,
        "POST",
        base_url + SUBMIT_PATH,
        headers={
            "Authorization": f"Bearer {api_key}",
            "X-DashScope-Async": "enable",
            # oss:// 临时 URL 必须在请求头显式声明可解析。
            "X-DashScope-OssResourceResolve": "enable",
        },
        json_body=body,
    )
    output = payload.get("output")
    task_id = output.get("task_id") if isinstance(output, dict) else None
    if not isinstance(task_id, str) or not task_id:
        raise ModelOutputInvalid(_MESSAGE_PARSE)
    return task_id


def _poll_task(
    http: httpx.Client,
    base_url: str,
    api_key: str,
    task_id: str,
    *,
    poll_interval: float,
    poll_timeout: float,
    sleep: Callable[[float], None],
) -> str:
    deadline = time.monotonic() + poll_timeout
    headers = {"Authorization": f"Bearer {api_key}"}
    while True:
        payload = _request_json(http, "GET", f"{base_url}{TASKS_PATH}/{task_id}", headers=headers)
        output = payload.get("output")
        if not isinstance(output, dict):
            raise ModelOutputInvalid(_MESSAGE_PARSE)
        status = output.get("task_status")
        if status == "SUCCEEDED":
            results = output.get("results")
            if not isinstance(results, list) or not results or not isinstance(results[0], dict):
                raise ModelOutputInvalid(_MESSAGE_PARSE)
            first = results[0]
            subtask = first.get("subtask_status")
            if subtask is not None and subtask != "SUCCEEDED":
                raise UpstreamRejected(_MESSAGE_TASK_FAILED)
            url = first.get("transcription_url")
            if not isinstance(url, str) or not url:
                raise ModelOutputInvalid(_MESSAGE_PARSE)
            return url
        if status == "FAILED":
            raise UpstreamRejected(_MESSAGE_TASK_FAILED)
        if status not in ("PENDING", "RUNNING"):
            raise ModelOutputInvalid(_MESSAGE_PARSE)
        if time.monotonic() >= deadline:
            raise UpstreamTimeout(_MESSAGE_TIMEOUT)
        sleep(poll_interval)


def _as_ms(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return int(value)


def _unit(payload: Any) -> TimedUnit | None:
    if not isinstance(payload, dict):
        return None
    text = payload.get("text")
    begin = _as_ms(payload.get("begin_time"))
    end = _as_ms(payload.get("end_time"))
    if not isinstance(text, str) or not text.strip() or begin is None or end is None:
        return None
    return TimedUnit(text=text, begin_ms=begin, end_ms=end)


def _timed_units(transcript: dict[str, Any]) -> tuple[TimedUnit, ...]:
    """优先词级时间戳；只有句级时退回句级；都没有则返回空元组。"""
    sentences = transcript.get("sentences")
    if not isinstance(sentences, list):
        return ()
    units: list[TimedUnit] = []
    for sentence in sentences:
        if not isinstance(sentence, dict):
            continue
        words = sentence.get("words")
        if isinstance(words, list) and words:
            units.extend(unit for word in words if (unit := _unit(word)) is not None)
    if units:
        return tuple(units)
    fallback: list[TimedUnit] = []
    for sentence in sentences:
        unit = _unit(sentence)
        if unit is not None:
            fallback.append(unit)
    return tuple(fallback)


def _duration_seconds(properties: Any, units: tuple[TimedUnit, ...]) -> float:
    if isinstance(properties, dict):
        value = properties.get("original_duration_in_milliseconds")
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0:
            return round(float(value) / 1000.0, 3)
    if units:
        span = max(unit.end_ms for unit in units) - min(unit.begin_ms for unit in units)
        if span > 0:
            return round(span / 1000.0, 3)
    return 0.0


def parse_transcription(payload: dict[str, Any]) -> TranscriptionResult:
    """解析 transcription_url 指向的识别结果 JSON（契约来自官方文档）。"""
    transcripts = payload.get("transcripts")
    if not isinstance(transcripts, list) or not transcripts or not isinstance(transcripts[0], dict):
        raise ModelOutputInvalid(_MESSAGE_PARSE)
    first = transcripts[0]
    text = first.get("text")
    if not isinstance(text, str):
        raise ModelOutputInvalid(_MESSAGE_PARSE)
    units = _timed_units(first)
    return TranscriptionResult(
        transcript=text,
        duration_seconds=_duration_seconds(payload.get("properties"), units),
        words=units,
    )


def transcribe_audio(
    *,
    audio: bytes,
    api_key: str,
    model: str = DEFAULT_MODEL,
    base_url: str,
    filename: str = "answer.webm",
    content_type: str = "audio/webm",
    language_hints: Iterable[str] | None = None,
    timeout: httpx.Timeout | float = REQUEST_TIMEOUT,
    client: httpx.Client | None = None,
    poll_interval: float = POLL_INTERVAL_SECONDS,
    poll_timeout: float = POLL_TIMEOUT_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
) -> TranscriptionResult:
    """把内存中的音频交给 DashScope Paraformer，返回转写与时间戳。

    传入 client（测试用 httpx.MockTransport）时由调用方负责关闭；未传入时本函数
    自建并在结束时关闭。任何路径都不会把音频写到磁盘。
    """
    base = base_url.rstrip("/")
    owns_client = client is None
    http = client if client is not None else httpx.Client(timeout=timeout)
    try:
        policy = _get_upload_policy(http, base, api_key, model)
        oss_url = _upload_audio(http, policy, audio, filename, content_type)
        task_id = _submit_task(http, base, api_key, model, oss_url, language_hints)
        result_url = _poll_task(
            http,
            base,
            api_key,
            task_id,
            poll_interval=poll_interval,
            poll_timeout=poll_timeout,
            sleep=sleep,
        )
        payload = _request_json(http, "GET", result_url)
        return parse_transcription(payload)
    finally:
        if owns_client:
            http.close()


def probe_credentials(
    *,
    api_key: str,
    model: str = DEFAULT_MODEL,
    base_url: str,
    timeout: httpx.Timeout | float = REQUEST_TIMEOUT,
    client: httpx.Client | None = None,
) -> tuple[bool, str]:
    """只校验 Key/地域/模型能否取得上传凭证，不消耗音频。

    返回 (ok, message)：message 永远是本模块的稳定文案，不含上游原文。
    """
    base = base_url.rstrip("/")
    owns_client = client is None
    http = client if client is not None else httpx.Client(timeout=timeout)
    try:
        _get_upload_policy(http, base, api_key, model)
    except (UpstreamRejected, UpstreamTimeout, ModelOutputInvalid) as exc:
        return False, str(exc)
    finally:
        if owns_client:
            http.close()
    return True, "凭据可用"
