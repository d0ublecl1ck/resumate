// 统一 HTTP 客户端：基地址、JSON 编解码与后端机器错误映射（C-06）。
// 开发环境默认请求 /api，由 Vite 代理转发到后端；可用 VITE_API_BASE_URL 覆盖。

import i18n from "@/i18n"
import type { ApiError, MachineErrorCode } from "@/lib/types"

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "/api"

export class ApiRequestError extends Error {
  readonly code: MachineErrorCode | "NETWORK_ERROR"
  readonly status: number
  readonly latestVersionId?: string

  constructor(code: MachineErrorCode | "NETWORK_ERROR", message: string, status: number, latestVersionId?: string) {
    super(message)
    this.name = "ApiRequestError"
    this.code = code
    this.status = status
    this.latestVersionId = latestVersionId
  }
}

/** 发出 JSON 请求；业务失败时抛出携带机器错误码的 ApiRequestError。 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiRequestError("NETWORK_ERROR", i18n.t("common.errors.network"), 0)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const payload = (await response.json().catch(() => null)) as ApiError | T | null

  if (!response.ok) {
    const error = payload as ApiError | null
    throw new ApiRequestError(
      error?.code ?? "VALIDATION_FAILED",
      error?.message ?? response.statusText ?? i18n.t("common.errors.requestFailed"),
      response.status,
      error?.latestVersionId,
    )
  }

  return payload as T
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
