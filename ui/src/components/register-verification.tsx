// SCR-000 注册成功：提示用户去邮箱查收验证链接。
// 纯展示组件：重发状态与动作由调用方注入，页面与 Storybook 共用 lib/verification 的真实重发实现。
// 视觉沿用登录页既有令牌（card-soft / primary / coral / cobalt），不新增页面视觉规则。

import { useTranslation } from "react-i18next"
import { Loader2, MailCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { AuthShell } from "@/components/auth-shell"
import type { ResendState } from "@/lib/verification"

export interface RegisterVerificationProps {
  email: string
  resend: ResendState
  onResend: () => void
  onChangeEmail: () => void
  onBackToLogin: () => void
  disabled?: boolean
}

const primaryButtonClass =
  "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
const secondaryButtonClass =
  "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-40"

export function RegisterVerification({ email, resend, onResend, onChangeEmail, onBackToLogin, disabled = false }: RegisterVerificationProps) {
  const { t } = useTranslation()
  const sending = resend.status === "sending"
  const cooling = resend.status === "cooldown" && (resend.cooldownSeconds ?? 0) > 0
  const alreadyVerified = resend.status === "already_verified"
  const resendDisabled = disabled || sending || cooling || alreadyVerified
  const resendLabel = sending
    ? t("auth.verification.resending")
    : cooling
      ? t("auth.verification.resendCooldown", { seconds: resend.cooldownSeconds })
      : t("auth.verification.resend")

  return (
    <AuthShell>
      <div className="flex size-10 items-center justify-center rounded-lg bg-cobalt/10 text-cobalt" aria-hidden>
        <MailCheck className="size-5" />
      </div>
      <h1 className="mt-4 font-serif text-2xl font-bold text-foreground">{t("auth.verification.sentTitle")}</h1>
      <p className="mt-2 break-all text-sm leading-6 text-muted-foreground">{t("auth.verification.sentDescription", { email })}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("auth.verification.sentHint")}</p>

      {resend.status === "error" && resend.errorMessage ? (
        <p role="alert" className="mt-4 rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
          {resend.errorMessage}
        </p>
      ) : null}

      {alreadyVerified ? (
        <p role="status" className="mt-4 rounded-md border border-cobalt/40 bg-cobalt/5 px-3 py-2 text-sm text-cobalt">
          {t("auth.verification.alreadyVerified")}
        </p>
      ) : null}

      {resend.status === "cooldown" ? (
        <p role="status" className="mt-4 rounded-md border border-cobalt/40 bg-cobalt/5 px-3 py-2 text-sm text-cobalt">
          {t("auth.verification.resendSent")}
        </p>
      ) : null}

      <button type="button" onClick={onResend} disabled={resendDisabled} aria-busy={sending} className={primaryButtonClass}>
        {sending ? <Loader2 className={cn("size-4 animate-spin")} aria-hidden /> : null}
        {resendLabel}
      </button>

      <button type="button" onClick={onChangeEmail} disabled={disabled || sending} className={secondaryButtonClass}>
        {t("auth.verification.changeEmail")}
      </button>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <button
          type="button"
          onClick={onBackToLogin}
          disabled={disabled || sending}
          className="font-semibold text-cobalt hover:underline disabled:opacity-40"
        >
          {t("auth.verification.backToLogin")}
        </button>
      </p>
    </AuthShell>
  )
}
