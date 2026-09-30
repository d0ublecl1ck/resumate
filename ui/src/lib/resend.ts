// 邮件重发状态机（b5586 从 d7b99 的 lib/verification 抽出，供验证邮件与重置邮件共用）：
// 维护 sending / cooldown / already_verified / error 四态与 60s 冷却计时，
// 机器错误码一律经键映射成 i18n 文案，禁止直出后端 message。

import { useEffect, useState } from "react"
import i18n from "@/i18n"
import { ApiRequestError } from "@/lib/api-client"

/** 与后端 email_verification_resend_cooldown_seconds / password_reset_resend_cooldown_seconds 默认值一致。 */
export const RESEND_COOLDOWN_SECONDS = 60

export type ResendStatus = "idle" | "sending" | "cooldown" | "already_verified" | "error"

export interface ResendState {
  status: ResendStatus
  cooldownSeconds?: number
  errorMessage?: string
  /** Address the last successful resend actually went to; drives the confirmation line. */
  sentEmail?: string
}

/** 后端 202 中性响应的公共形状：验证邮件与重置邮件一致。 */
export interface ResendAccepted {
  status: string
  email: string
}

function errorKeyForCode(code?: string): string {
  switch (code) {
    case "EMAIL_NOT_VERIFIED":
      return "auth.errors.emailNotVerified"
    case "VERIFICATION_TOKEN_INVALID":
      return "auth.errors.verificationTokenInvalid"
    case "PASSWORD_RESET_TOKEN_INVALID":
      return "auth.errors.passwordResetTokenInvalid"
    case "RESEND_TOO_SOON":
      return "auth.errors.resendTooSoon"
    case "RATE_LIMITED":
      return "auth.errors.rateLimited"
    case "NETWORK_ERROR":
      return "auth.errors.network"
    default:
      return "auth.errors.generic"
  }
}

/** 认证类邮件动作的公共错误映射：先映射机器错误码，再渲染 i18n 文案。 */
export function authMachineErrorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) return i18n.t(errorKeyForCode(cause.code))
  return i18n.t("auth.errors.generic")
}

export function useResendMachine<TInput>(
  send: (input: TInput) => Promise<ResendAccepted>,
  errorMessage: (cause: unknown) => string,
  cooldownSeconds: number = RESEND_COOLDOWN_SECONDS,
) {
  const [status, setStatus] = useState<ResendStatus>("idle")
  const [errorText, setErrorText] = useState<string | undefined>(undefined)
  const [sentEmail, setSentEmail] = useState<string | undefined>(undefined)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((value) => (value > 0 ? value - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  async function resend(input: TInput) {
    setStatus("sending")
    setErrorText(undefined)
    setSentEmail(undefined)
    try {
      const accepted = await send(input)
      setSentEmail(accepted.email)
      if (accepted.status === "already_verified") {
        setStatus("already_verified")
        return
      }
      setCooldown(cooldownSeconds)
      setStatus("cooldown")
    } catch (cause) {
      setErrorText(errorMessage(cause))
      setStatus("error")
    }
  }

  /** Back to the initial form: used by "use another email" before the machine is reused. */
  function reset() {
    setStatus("idle")
    setErrorText(undefined)
    setSentEmail(undefined)
    setCooldown(0)
  }

  const resendState: ResendState = {
    status: cooldown > 0 ? "cooldown" : status,
    cooldownSeconds: cooldown || undefined,
    errorMessage: errorText,
    sentEmail,
  }
  return { resend, resendState, reset }
}
