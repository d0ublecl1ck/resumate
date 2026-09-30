// SCR-000 /reset-password 结果态：换密成功与链接失效（b5586）。
// 纯展示组件：状态与动作由调用方注入；失效态可重新申请重置邮件或返回登录。
// 视觉沿用登录页既有令牌（card-soft / primary / coral / cobalt），不新增页面视觉规则。

import { useTranslation } from "react-i18next"
import { CircleCheck, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { AuthShell } from "@/components/auth-shell"

export type ResetResultState = "success" | "invalid"
export type ResetInvalidReason = "expired" | "used" | "malformed"

export interface ResetPasswordResultProps {
  state: ResetResultState
  reason?: ResetInvalidReason
  /** 机器错误码映射后的文案（例如 PASSWORD_RESET_TOKEN_INVALID）。 */
  error?: string
  onGoToLogin?: () => void
  onRequestNewLink?: () => void
  disabled?: boolean
}

const primaryButtonClass =
  "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
const secondaryButtonClass =
  "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-40"

export function ResetPasswordResult({ state, reason, error, onGoToLogin, onRequestNewLink, disabled = false }: ResetPasswordResultProps) {
  const { t } = useTranslation()
  const tone = state === "invalid" ? "bg-coral/10 text-coral" : "bg-cobalt/10 text-cobalt"

  return (
    <AuthShell>
      <div className={cn("flex size-10 items-center justify-center rounded-lg", tone)} aria-hidden>
        {state === "success" ? <CircleCheck className="size-5" /> : null}
        {state === "invalid" ? <TriangleAlert className="size-5" /> : null}
      </div>

      {state === "success" ? (
        <>
          <h1 className="mt-4 font-serif text-2xl font-bold text-foreground">{t("auth.passwordReset.successTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("auth.passwordReset.successDescription")}</p>
          <button type="button" onClick={onGoToLogin} disabled={disabled} className={primaryButtonClass}>
            {t("auth.passwordReset.goToLogin")}
          </button>
        </>
      ) : null}

      {state === "invalid" ? (
        <>
          <h1 className="mt-4 font-serif text-2xl font-bold text-foreground">{t("auth.passwordReset.invalidTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("auth.passwordReset.invalidDescription")}</p>
          {reason ? <p className="mt-2 text-xs leading-5 text-coral">{t("auth.passwordReset.invalidReason." + reason)}</p> : null}

          {error ? (
            <p role="alert" className="mt-4 rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}

          <button type="button" onClick={onRequestNewLink} disabled={disabled} className={primaryButtonClass}>
            {t("auth.passwordReset.requestNewLink")}
          </button>

          <button type="button" onClick={onGoToLogin} disabled={disabled} className={secondaryButtonClass}>
            {t("auth.passwordReset.backToLogin")}
          </button>
        </>
      ) : null}
    </AuthShell>
  )
}
