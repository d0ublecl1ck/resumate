// 邮箱验证重发状态机（d7b99）：调用 /auth/verification/resend，维护 60s 冷却与错误文案。
// 页面（注册成功 / 登录被拒 / 失效链接）与 Storybook 共用同一份真实实现，不保留演示分支。

import { useEffect, useState } from "react"
import i18n from "@/i18n"
import { resendVerification } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import type { ResendVerificationInput } from "@/lib/types"

/** 与后端 email_verification_resend_cooldown_seconds 默认值保持一致。 */
export const RESEND_COOLDOWN_SECONDS = 60

export type ResendStatus = "idle" | "sending" | "cooldown" | "already_verified" | "error"

export interface ResendState {
  status: ResendStatus
  cooldownSeconds?: number
  errorMessage?: string
  /** Address the last successful resend actually went to; drives the confirmation line. */
  sentEmail?: string
}

function errorKeyForCode(code?: string): string {
  switch (code) {
    case "EMAIL_NOT_VERIFIED":
      return "auth.errors.emailNotVerified"
    case "VERIFICATION_TOKEN_INVALID":
      return "auth.errors.verificationTokenInvalid"
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

/** 把重发失败映射到 i18n 文案，绝不直出后端英文 message。 */
export function verificationErrorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) return i18n.t(errorKeyForCode(cause.code))
  return i18n.t("auth.errors.generic")
}

export function useVerificationResend() {
  const [status, setStatus] = useState<ResendStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const [sentEmail, setSentEmail] = useState<string | undefined>(undefined)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((value) => (value > 0 ? value - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  async function resend(input: ResendVerificationInput) {
    setStatus("sending")
    setErrorMessage(undefined)
    setSentEmail(undefined)
    try {
      const accepted = await resendVerification(input)
      setSentEmail(accepted.email)
      if (accepted.status === "already_verified") {
        setStatus("already_verified")
        return
      }
      setCooldown(RESEND_COOLDOWN_SECONDS)
      setStatus("cooldown")
    } catch (cause) {
      setErrorMessage(verificationErrorMessage(cause))
      setStatus("error")
    }
  }

  const resendState: ResendState = {
    status: cooldown > 0 ? "cooldown" : status,
    cooldownSeconds: cooldown || undefined,
    errorMessage,
    sentEmail,
  }
  return { resend, resendState }
}
