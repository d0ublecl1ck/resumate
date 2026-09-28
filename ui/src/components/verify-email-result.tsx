// SCR-000 /verify-email：验证中 / 验证成功 / 链接失效三态。
// 纯展示组件：三态与重发状态由调用方注入；失效态按 token 重发，不再让用户输入邮箱（d7b99）。
// 视觉沿用登录页既有令牌（card-soft / primary / coral / cobalt），不新增页面视觉规则。

import { useTranslation } from "react-i18next"
import { CircleCheck, Loader2, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { AuthShell } from "@/components/auth-shell"
import type { ResendState } from "@/lib/verification"

export type VerifyState = "verifying" | "success" | "invalid"
export type VerifyInvalidReason = "expired" | "used" | "malformed"

export interface VerifyEmailResultProps {
  state: VerifyState
  reason?: VerifyInvalidReason
  resend: ResendState
  /** false 时链接本身不可用于重发（例如地址里没有 token），只保留返回登录。 */
  resendAvailable?: boolean
  onResend: () => void
  onGoToWorkbench?: () => void
  onBackToSignIn?: () => void
  disabled?: boolean
}

function resendLabel(resend: ResendState, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (resend.status === "sending") return t("auth.verification.resending")
  if (resend.status === "cooldown" && (resend.cooldownSeconds ?? 0) > 0) {
    return t("auth.verification.resendCooldown", { seconds: resend.cooldownSeconds })
  }
  return t("auth.verification.resend")
}

export function VerifyEmailResult({
  state,
  reason,
  resend,
  resendAvailable = true,
  onResend,
  onGoToWorkbench,
  onBackToSignIn,
  disabled = false,
}: VerifyEmailResultProps) {
  const { t } = useTranslation()
  const sending = resend.status === "sending"
  const cooling = resend.status === "cooldown" && (resend.cooldownSeconds ?? 0) > 0
  const alreadyVerified = resend.status === "already_verified"
  const canResend = resendAvailable && !disabled && !sending && !cooling && !alreadyVerified
  const tone = state === "invalid" ? "bg-coral/10 text-coral" : "bg-cobalt/10 text-cobalt"

  return (
    <AuthShell>
      <div className={cn("flex size-10 items-center justify-center rounded-lg", tone)} aria-hidden>
        {state === "verifying" ? <Loader2 className="size-5 animate-spin" /> : null}
        {state === "success" ? <CircleCheck className="size-5" /> : null}
        {state === "invalid" ? <TriangleAlert className="size-5" /> : null}
      </div>

      {state === "verifying" ? (
        <>
          <h1 className="mt-4 font-serif text-2xl font-bold text-foreground">{t("auth.verification.verifyingTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("auth.verification.verifyingDescription")}</p>
        </>
      ) : null}

      {state === "success" ? (
        <>
          <h1 className="mt-4 font-serif text-2xl font-bold text-foreground">{t("auth.verification.verifiedTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("auth.verification.verifiedDescription")}</p>
          <button
            type="button"
            onClick={onGoToWorkbench}
            disabled={disabled}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {t("auth.verification.goToWorkbench")}
          </button>
        </>
      ) : null}

      {state === "invalid" ? (
        <>
          <h1 className="mt-4 font-serif text-2xl font-bold text-foreground">{t("auth.verification.invalidTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("auth.verification.invalidDescription")}</p>
          {reason ? <p className="mt-2 text-xs leading-5 text-coral">{t("auth.verification.invalidReason." + reason)}</p> : null}

          {resend.status === "error" && resend.errorMessage ? (
            <p role="alert" className="mt-4 rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
              {resend.errorMessage}
            </p>
          ) : null}

          {cooling ? (
            <p role="status" className="mt-4 break-all rounded-md border border-cobalt/40 bg-cobalt/5 px-3 py-2 text-sm text-cobalt">
              {t("auth.verification.resendSentTo", { email: resend.sentEmail ?? "" })}
            </p>
          ) : null}

          {alreadyVerified ? (
            <p role="status" className="mt-4 rounded-md border border-cobalt/40 bg-cobalt/5 px-3 py-2 text-sm text-cobalt">
              {t("auth.verification.alreadyVerified")}
            </p>
          ) : null}

          {resendAvailable ? (
            <button
              type="button"
              onClick={onResend}
              disabled={!canResend}
              aria-busy={sending}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {resendLabel(resend, t)}
            </button>
          ) : null}
        </>
      ) : null}

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <button
          type="button"
          onClick={onBackToSignIn}
          disabled={disabled || sending}
          className="font-semibold text-cobalt hover:underline disabled:opacity-40"
        >
          {t("auth.verification.backToLogin")}
        </button>
      </p>
    </AuthShell>
  )
}
