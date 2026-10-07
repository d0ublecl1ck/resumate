// 失败出口的文案策略：只有业务校验（422 VALIDATION_FAILED）才允许展示后端 message，
// 其余错误码一律回落到调用方给的 i18n 文案，避免英文原文泄漏到界面。
// 放在 lib 层集中收口，组件只拿到已判定的可展示文本，不再各自判断。
import { ApiRequestError } from "@/lib/api-client"

export interface UserFacingError {
  message: string
  code?: string
}

export function userFacingError(cause: unknown, fallback: string): UserFacingError {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "VALIDATION_FAILED") return { message: cause.message, code: cause.code }
    return { message: fallback, code: cause.code }
  }
  return { message: fallback }
}
