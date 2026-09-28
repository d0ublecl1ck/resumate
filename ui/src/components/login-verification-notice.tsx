// SCR-000 登录被拒（EMAIL_NOT_VERIFIED）时的内联重发入口。
// 纯展示组件，复用 lib/verification 的重发状态与动作；页面只需注入状态。
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import type { ResendState } from "@/lib/verification"

export function LoginVerificationNotice({ resend, onResend, disabled = false }: { resend: ResendState; onResend: () => void; disabled?: boolean }) {
  const { t } = useTranslation()
  const sending = resend.status === "sending"
  const cooling = resend.status === "cooldown" && (resend.cooldownSeconds ?? 0) > 0
  const alreadyVerified = resend.status === "already_verified"
  const label = sending
    ? t("auth.verification.resending")
    : cooling
      ? t("auth.verification.resendCooldown", { seconds: resend.cooldownSeconds })
      : t("auth.verification.resend")

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      {cooling ? (
        <p className="mb-1.5 break-all text-xs text-cobalt">{t("auth.verification.resendSentTo", { email: resend.sentEmail ?? "" })}</p>
      ) : null}
      {alreadyVerified ? <p className="mb-1.5 text-xs text-cobalt">{t("auth.verification.alreadyVerified")}</p> : null}
      {resend.status === "error" && resend.errorMessage ? (
        <p role="alert" className="mb-1.5 text-xs text-coral">
          {resend.errorMessage}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onResend}
        disabled={disabled || sending || cooling || alreadyVerified}
        aria-busy={sending}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-cobalt hover:underline disabled:opacity-40"
      >
        {sending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
        {label}
      </button>
    </div>
  )
}
