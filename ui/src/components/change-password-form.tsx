// 设置页「修改密码」区块：当前密码 + 新密码 + 确认。
// 校验走 react-hook-form + zodResolver；提交后的机器错误码映射到 i18n 文案，不直出服务端 message。

import { useMemo } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { z } from "zod"
import { changePassword } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { CURRENT_USER_QUERY_KEY } from "@/lib/session"
import { AlertTriangle, CheckCircle2, KeyRound } from "lucide-react"

const INPUT_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
const SUBMIT_CLASS =
  "rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"

type PasswordValues = { currentPassword: string; newPassword: string; confirmPassword: string }

export function ChangePasswordForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const schema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t("settings.password.errors.requiredCurrent")),
          newPassword: z.string().min(8, t("settings.password.errors.shortPassword")),
          confirmPassword: z.string().min(1, t("settings.password.errors.requiredConfirm")),
        })
        .refine((values) => values.newPassword === values.confirmPassword, {
          path: ["confirmPassword"],
          message: t("settings.password.errors.mismatch"),
        }),
    [t],
  )

  const { register, handleSubmit, reset, formState } = useForm<PasswordValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  })

  const mutation = useMutation({
    mutationFn: (values: PasswordValues) =>
      changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword }),
    onSuccess: () => reset(),
  })

  function messageFor(cause: unknown): string {
    if (cause instanceof ApiRequestError) {
      if (cause.code === "INVALID_CREDENTIALS") return t("settings.password.errors.invalidCurrent")
      if (cause.code === "VALIDATION_FAILED") return t("settings.password.errors.samePassword")
      if (cause.code === "NETWORK_ERROR") return t("settings.password.errors.network")
      return t("settings.password.errors.generic")
    }
    return t("settings.password.errors.generic")
  }

  function goToLogin() {
    // 后端换密时已注销全部会话；清掉本地用户缓存后由路由守卫把用户送回登录页。
    queryClient.removeQueries({ queryKey: CURRENT_USER_QUERY_KEY })
    navigate("/login", { replace: true })
  }

  const fieldError =
    formState.errors.currentPassword?.message ?? formState.errors.newPassword?.message ?? formState.errors.confirmPassword?.message

  return (
    <section className="card-soft p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
        <KeyRound className="size-4 text-cobalt" aria-hidden /> {t("settings.password.title")}
      </h2>
      <p className="mt-1 mb-4 text-xs leading-5 text-muted-foreground">{t("settings.password.hint")}</p>

      {mutation.isSuccess ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-cobalt/40 bg-cobalt/5 px-3 py-2 text-sm text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-cobalt" aria-hidden /> {t("settings.password.success")}
          </span>
          <button type="button" onClick={goToLogin} className="text-xs font-semibold text-cobalt hover:underline">
            {t("settings.password.goToLogin")}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("settings.password.current")}</span>
            <input type="password" autoComplete="current-password" disabled={mutation.isPending} className={INPUT_CLASS} {...register("currentPassword")} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("settings.password.new")}</span>
            <input type="password" autoComplete="new-password" disabled={mutation.isPending} className={INPUT_CLASS} {...register("newPassword")} />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">{t("settings.password.confirm")}</span>
            <input type="password" autoComplete="new-password" disabled={mutation.isPending} className={INPUT_CLASS} {...register("confirmPassword")} />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
            <button type="submit" disabled={mutation.isPending} aria-busy={mutation.isPending} className={SUBMIT_CLASS}>
              {mutation.isPending ? t("settings.password.submitting") : t("settings.password.submit")}
            </button>
            {fieldError ? (
              <span role="alert" className="text-xs text-coral">
                {fieldError}
              </span>
            ) : null}
            {mutation.isError ? (
              <span role="alert" className="inline-flex items-center gap-1 text-xs text-coral">
                <AlertTriangle className="size-3.5" aria-hidden /> {messageFor(mutation.error)}
              </span>
            ) : null}
          </div>
        </form>
      )}
    </section>
  )
}
