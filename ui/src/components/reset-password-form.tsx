// SCR-000 /reset-password：用一次性令牌设置新密码（b5586）。
// 视觉沿用登录页既有令牌（card-soft / primary / coral / cobalt / font-serif / rounded-lg / 48px 触控高度），不新增页面视觉规则。
// 校验前移：react-hook-form + zod 在提交前拦长度与两次输入一致；提交是用户动作，挂载不发请求。

import { useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { AuthShell } from "@/components/auth-shell"

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"

export interface ResetPasswordFormProps {
  onSubmit: (values: { password: string }) => void
  submitting?: boolean
  error?: string | null
  onBackToLogin?: () => void
  disabled?: boolean
}

export function ResetPasswordForm({ onSubmit, submitting = false, error = null, onBackToLogin, disabled = false }: ResetPasswordFormProps) {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z
        .object({
          password: z.string().min(8, t("auth.errors.shortPassword")),
          confirmPassword: z.string().min(1, t("auth.errors.requiredPassword")),
        })
        .refine((values) => values.password === values.confirmPassword, {
          message: t("auth.passwordReset.mismatch"),
          path: ["confirmPassword"],
        }),
    [t],
  )
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema) })
  const busy = disabled || submitting
  const fieldError = formState.errors.password?.message ?? formState.errors.confirmPassword?.message

  return (
    <AuthShell>
      <form onSubmit={handleSubmit((values) => onSubmit({ password: values.password }))} noValidate>
        <h1 className="font-serif text-2xl font-bold text-foreground">{t("auth.passwordReset.resetTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.passwordReset.resetSubtitle")}</p>

        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          <label className="block" htmlFor="reset-password">
            <span className="mb-1 block text-xs text-muted-foreground">{t("auth.fields.newPassword")}</span>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              aria-describedby="reset-password-hint"
              disabled={busy}
              className={inputClass}
              {...register("password")}
            />
          </label>

          <label className="block" htmlFor="reset-password-confirm">
            <span className="mb-1 block text-xs text-muted-foreground">{t("auth.fields.confirmPassword")}</span>
            <input
              id="reset-password-confirm"
              type="password"
              autoComplete="new-password"
              disabled={busy}
              className={inputClass}
              {...register("confirmPassword")}
            />
          </label>
        </div>

        <span id="reset-password-hint" className="mt-2 block text-xs text-muted-foreground">
          {t("auth.fields.passwordHint")}
        </span>

        {fieldError ? (
          <p role="alert" className="mt-4 rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
            {fieldError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          aria-busy={submitting}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {submitting ? t("auth.passwordReset.resetSubmitting") : t("auth.passwordReset.resetSubmit")}
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
