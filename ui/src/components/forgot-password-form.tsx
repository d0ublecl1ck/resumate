// SCR-000 /forgot-password：输入注册邮箱，请求一封一次性重置邮件（b5586）。
// 视觉沿用登录页既有令牌（card-soft / primary / coral / cobalt / font-serif / rounded-lg / 48px 触控高度），不新增页面视觉规则。
// 提交由用户动作触发，不在挂载 effect 里发请求。

import { useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { AuthShell } from "@/components/auth-shell"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"

export interface ForgotPasswordFormProps {
  onSubmit: (values: { email: string }) => void
  submitting?: boolean
  error?: string | null
  initialEmail?: string
  onBackToLogin?: () => void
  disabled?: boolean
}

export function ForgotPasswordForm({
  onSubmit,
  submitting = false,
  error = null,
  initialEmail = "",
  onBackToLogin,
  disabled = false,
}: ForgotPasswordFormProps) {
  const { t } = useTranslation()
  const schema = useMemo(() => z.object({ email: z.string().regex(EMAIL_PATTERN, t("auth.errors.invalidEmail")) }), [t])
  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: initialEmail },
  })
  const busy = disabled || submitting

  return (
    <AuthShell>
      <form onSubmit={handleSubmit((values) => onSubmit({ email: values.email.trim() }))} noValidate>
        <h1 className="font-serif text-2xl font-bold text-foreground">{t("auth.passwordReset.forgotTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.passwordReset.forgotSubtitle")}</p>

        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
            {error}
          </p>
        ) : null}

        <label className="mt-5 block" htmlFor="forgot-email">
          <span className="mb-1 block text-xs text-muted-foreground">{t("auth.fields.email")}</span>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            disabled={busy}
            className={inputClass}
            {...register("email")}
          />
        </label>

        {formState.errors.email?.message ? (
          <p role="alert" className="mt-4 rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
            {formState.errors.email.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          aria-busy={submitting}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {submitting ? t("auth.passwordReset.forgotSubmitting") : t("auth.passwordReset.forgotSubmit")}
        </button>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={onBackToLogin}
            disabled={busy}
            className="font-semibold text-cobalt hover:underline disabled:opacity-40"
          >
            {t("auth.passwordReset.backToLogin")}
          </button>
        </p>
      </form>
    </AuthShell>
  )
}
