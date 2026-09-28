// 登录 / 注册表单（表现层）。
// 视觉对齐现有应用（card-soft / bg-primary / font-serif / coral 错误色），
// 文案全部经 i18n 的 auth 命名空间读取；原型 ui/prototypes/index.html 未覆盖登录页，待原型确认。
// 校验前移：react-hook-form + zod 在提交前拦截非法输入，不再依赖后端 EmailStr 兜底。

import { useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { z } from "zod"

export type LoginMode = "login" | "register"

export interface LoginCredentials {
  email: string
  password: string
  displayName?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"

export function LoginForm({
  mode,
  onModeChange,
  onSubmit,
  submitting = false,
  error = null,
  notice = null,
  initialEmail = "",
  initialPassword = "",
  initialDisplayName = "",
}: {
  mode: LoginMode
  onModeChange: (mode: LoginMode) => void
  onSubmit: (credentials: LoginCredentials) => void
  submitting?: boolean
  error?: string | null
  /** 附加在错误下方的内联提示/动作（例如 EMAIL_NOT_VERIFIED 的重发入口）。 */
  notice?: React.ReactNode
  initialEmail?: string
  initialPassword?: string
  initialDisplayName?: string
}) {
  const { t } = useTranslation()
  const isRegister = mode === "register"

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().regex(EMAIL_PATTERN, t("auth.errors.invalidEmail")),
        password: z
          .string()
          .min(isRegister ? 8 : 1, isRegister ? t("auth.errors.shortPassword") : t("auth.errors.requiredPassword")),
        displayName: isRegister ? z.string().min(1, t("auth.errors.requiredName")) : z.string().optional(),
      }),
    [isRegister, t],
  )

  const { register, handleSubmit, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: initialEmail, password: initialPassword, displayName: initialDisplayName },
  })

  const fieldError =
    formState.errors.email?.message ?? formState.errors.password?.message ?? formState.errors.displayName?.message

  const submit = handleSubmit((values) => {
    onSubmit({
      email: values.email.trim(),
      password: values.password,
      ...(isRegister ? { displayName: (values.displayName ?? "").trim() } : {}),
    })
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block font-serif text-lg font-bold leading-none text-foreground">{t("nav.brand.name")}</span>
            <span className="block text-[11px] text-muted-foreground">{t("nav.brand.tagline")}</span>
          </span>
        </div>

        <form onSubmit={submit} noValidate className="card-soft p-6">
          <h1 className="font-serif text-2xl font-bold text-foreground">{isRegister ? t("auth.register.title") : t("auth.login.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{isRegister ? t("auth.register.subtitle") : t("auth.login.subtitle")}</p>

          {error ? (
            <p role="alert" className="mt-4 rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          ) : null}

          {notice ? <div className="mt-3">{notice}</div> : null}

          <div className="mt-5 space-y-4">
            {isRegister ? (
              <label className="block" htmlFor="login-name">
                <span className="mb-1 block text-xs text-muted-foreground">{t("auth.fields.displayName")}</span>
                <input
                  id="login-name"
                  autoComplete="name"
                  disabled={submitting}
                  className={inputClass}
                  {...register("displayName")}
                />
              </label>
            ) : null}

            <label className="block" htmlFor="login-email">
              <span className="mb-1 block text-xs text-muted-foreground">{t("auth.fields.email")}</span>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                disabled={submitting}
                className={inputClass}
                {...register("email")}
              />
            </label>

            <div>
              <label className="block" htmlFor="login-password">
                <span className="mb-1 block text-xs text-muted-foreground">{t("auth.fields.password")}</span>
                <input
                  id="login-password"
                  type="password"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  aria-describedby={isRegister ? "login-password-hint" : undefined}
                  disabled={submitting}
                  className={inputClass}
                  {...register("password")}
                />
              </label>
              {isRegister ? (
                <span id="login-password-hint" className="mt-1 block text-xs text-muted-foreground">
                  {t("auth.fields.passwordHint")}
                </span>
              ) : null}
            </div>
          </div>

          {fieldError ? (
            <p role="alert" className="mt-4 rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
              {fieldError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {submitting ? t("auth.actions.submitting") : isRegister ? t("auth.actions.register") : t("auth.actions.login")}
          </button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {isRegister ? t("auth.actions.haveAccount") : t("auth.actions.noAccount")}
            <button
              type="button"
              onClick={() => onModeChange(isRegister ? "login" : "register")}
              disabled={submitting}
              className="ml-1 font-semibold text-cobalt hover:underline disabled:opacity-40"
            >
              {isRegister ? t("auth.actions.switchToLogin") : t("auth.actions.switchToRegister")}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
