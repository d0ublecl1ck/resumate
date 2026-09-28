// SCR-000 登录页（容器）：调用 /auth/login 或 /auth/register，成功后写入会话缓存并跳转。
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import i18n from "@/i18n"
import { login as loginRequest, register as registerRequest } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { CURRENT_USER_QUERY_KEY, useCurrentUser } from "@/lib/session"
import { LoginForm, type LoginCredentials, type LoginMode } from "@/components/login-form"
import { PageLoading } from "@/pages/states"
import type { AuthUser } from "@/lib/types"

export function LoginPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<LoginMode>("login")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentUser = useCurrentUser()

  const from = (location.state as { from?: string } | null)?.from ?? "/"

  async function submit(credentials: LoginCredentials) {
    setSubmitting(true)
    setError(null)
    try {
      const user: AuthUser =
        mode === "register"
          ? await registerRequest({ email: credentials.email, password: credentials.password, displayName: credentials.displayName ?? "" })
          : await loginRequest(credentials.email, credentials.password)
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, user)
      navigate(from, { replace: true })
    } catch (cause) {
      setError(messageFor(cause))
    } finally {
      setSubmitting(false)
    }
  }

  if (currentUser.isPending) return <PageLoading label={t("auth.sessionChecking")} />
  if (currentUser.data) return <Navigate to={from} replace />

  return (
    <LoginForm
      mode={mode}
      onModeChange={(next) => {
        setMode(next)
        setError(null)
      }}
      onSubmit={submit}
      submitting={submitting}
      error={error}
    />
  )
}

function messageFor(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "ACCOUNT_BANNED") return i18n.t("auth.errors.accountBanned")
    if (cause.code === "INVALID_CREDENTIALS") return i18n.t("auth.errors.invalidCredentials")
    if (cause.code === "EMAIL_ALREADY_REGISTERED") return i18n.t("auth.errors.emailRegistered")
    if (cause.code === "NETWORK_ERROR") return i18n.t("auth.errors.network")
    return cause.message // error-message-allow: 遗留兜底，待把机器错误码映射到 i18n 文案（Issue 6a58a）
  }
  return i18n.t("auth.errors.generic")
}
