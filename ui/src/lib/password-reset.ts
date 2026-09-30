// 忘记密码状态机（b5586）：调用 /auth/password/forgot 与 /auth/password/reset。
// 与 lib/verification 同构：页面与 Storybook 共用同一份真实实现，不保留演示分支；
// 重置链接是一次性令牌，提交只由用户动作触发一次（不得放进 StrictMode 会重挂载的 effect）。

import i18n from "@/i18n"
import { forgotPassword } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { authMachineErrorMessage, useResendMachine, type ResendState } from "@/lib/resend"

export type { ResendState }

/** 重发重置邮件的失败映射（与验证邮件同一套键）。 */
export const passwordResetErrorMessage = authMachineErrorMessage

/** 提交新密码的失败映射；令牌失配必须落到 i18n 文案，不得直出后端 message。 */
export function passwordResetSubmitErrorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "PASSWORD_RESET_TOKEN_INVALID") return i18n.t("auth.errors.passwordResetTokenInvalid")
    if (cause.code === "VALIDATION_FAILED") return i18n.t("auth.errors.invalidInput")
  }
  return passwordResetErrorMessage(cause)
}

export function usePasswordResetResend() {
  return useResendMachine(forgotPassword, passwordResetErrorMessage)
}
