// 统一 HTTP 客户端：基地址、JSON 编解码与后端机器错误映射（C-06）。
// 开发环境默认请求 /api，由 Vite 代理转发到后端；可用 VITE_API_BASE_URL 覆盖。

import i18n from "@/i18n"
import type { ApiError, MachineErrorCode } from "@/lib/types"

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "/api"

/** 客户端合成码：服务端不会下发，用于网络失败与非 JSON 的 5xx 兜底。 */
type ClientErrorCode = "NETWORK_ERROR" | "SERVER_ERROR"

export class ApiRequestError extends Error {
  readonly code: MachineErrorCode | ClientErrorCode
  readonly status: number
  readonly latestVersionId?: string

  constructor(code: MachineErrorCode | ClientErrorCode, message: string, status: number, latestVersionId?: string) {
    super(message)
    this.name = "ApiRequestError"
    this.code = code
    this.status = status
    this.latestVersionId = latestVersionId
  }
}

/** 发出请求并保留原始 Response；网络失败时抛出 ApiRequestError。 */
async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")

  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiRequestError("NETWORK_ERROR", i18n.t("common.errors.network"), 0)
  }
}

/** 解析响应体并映射业务错误；需要响应头的调用方改用 requestWithResponse。 */
async function parseJson<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const payload = (await response.json().catch(() => null)) as ApiError | T | null

  if (!response.ok) {
    const error = payload as ApiError | null
    // JSON 错误体按后端机器码原样映射（既有行为不变）；只有「响应体不是 JSON、没有机器码」
    // 的情况才按状态兜底：5xx 是服务端故障，不能误报成参数校验失败。
    const fallbackCode: MachineErrorCode | ClientErrorCode = payload === null && response.status >= 500 ? "SERVER_ERROR" : "VALIDATION_FAILED"
    throw new ApiRequestError(
      error?.code ?? fallbackCode,
      error?.message ?? response.statusText ?? i18n.t("common.errors.requestFailed"),
      response.status,
      error?.latestVersionId,
    )
  }

  return payload as T
}

/** 发出 JSON 请求；业务失败时抛出携带机器错误码的 ApiRequestError。 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return parseJson<T>(await send(path, init))
}

/**
 * 与 request 行为一致，但额外返回原始 Response，供需要读取响应头（如分页
 * X-Total-Count）的端点使用；全局 request 的返回形状保持不变。
 */
export async function requestWithResponse<T>(path: string, init: RequestInit = {}): Promise<{ data: T; response: Response }> {
  const response = await send(path, init)
  return { data: await parseJson<T>(response), response }
}

/**
 * 请求纯文本响应并保留原始 Response，供需要读取响应头（如附件文件名）的端点使用；
 * 失败时与 request 一样解析 JSON 错误体，把机器码与状态带回调用方。
 */
export async function requestTextWithResponse(path: string, init: RequestInit = {}): Promise<{ text: string; response: Response }> {
  const response = await send(path, init)
  const text = await response.text()
  if (!response.ok) {
    let payload: ApiError | null = null
    try {
      payload = JSON.parse(text) as ApiError
    } catch {
      payload = null
    }
    const fallbackCode: MachineErrorCode | ClientErrorCode = payload === null && response.status >= 500 ? "SERVER_ERROR" : "VALIDATION_FAILED"
    throw new ApiRequestError(
      payload?.code ?? fallbackCode,
      payload?.message ?? response.statusText ?? i18n.t("common.errors.requestFailed"),
      response.status,
      payload?.latestVersionId,
    )
  }
  return { text, response }
}

/**
 * 请求二进制响应（如服务端取回的 TTS 音频）并保留原始 Response；
 * 失败时与 request 一样解析 JSON 错误体，把机器码与状态带回调用方。
 */
export async function requestBlobWithResponse(
  path: string,
  init: RequestInit = {},
): Promise<{ blob: Blob; response: Response }> {
  const response = await send(path, init)
  if (!response.ok) {
    const text = await response.text()
    let payload: ApiError | null = null
    try {
      payload = JSON.parse(text) as ApiError
    } catch {
      payload = null
    }
    const fallbackCode: MachineErrorCode | ClientErrorCode =
      payload === null && response.status >= 500 ? "SERVER_ERROR" : "VALIDATION_FAILED"
    throw new ApiRequestError(
      payload?.code ?? fallbackCode,
      payload?.message ?? response.statusText ?? i18n.t("common.errors.requestFailed"),
      response.status,
      payload?.latestVersionId,
    )
  }
  return { blob: await response.blob(), response }
}

/** 请求纯文本响应（如 Markdown 备份索引）。 */
export async function requestText(path: string, init: RequestInit = {}): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init)
  } catch {
    throw new ApiRequestError("NETWORK_ERROR", i18n.t("common.errors.network"), 0)
  }

  const text = await response.text()

  if (!response.ok) {
    throw new ApiRequestError("VALIDATION_FAILED", text || response.statusText || i18n.t("common.errors.requestFailed"), response.status)
  }

  return text
}
