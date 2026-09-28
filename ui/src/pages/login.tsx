// SCR-000 登录页（容器）：登录 / 注册 / 邮箱验证三态。
// 注册成功不产生会话，只进入「查收验证邮件」；登录被拒 EMAIL_NOT_VERIFIED 时提供内联重发（d7b99）。
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import i18n from "@/i18n"
import { login as loginRequest, register as registerRequest } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { CURRENT_USER_QUERY_KEY, useCurrentUser } from "@/lib/session"
import { useVerificationResend } from "@/lib/verification"
import { LoginForm, type LoginCredentials, type LoginMode } from "@/components/login-form"
import { LoginVerificationNotice } from "@/components/login-verification-notice"
import { RegisterVerification } from "@/components/register-verification"
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
  const [lastEmail, setLastEmail] = useState("")
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const { resend, resendState } = useVerificationResend()
  const currentUser = useCurrentUser()

  const from = (location.state as { from?: string } | null)?.from ?? "/"

  async function submit(credentials: LoginCredentials) {
    setSubmitting(true)
    setError(null)
    setUnverifiedEmail(null)
    setLastEmail(credentials.email)
    try {
      if (mode === "register") {
        const accepted = await registerRequest({ email: credentials.email, password: credentials.password, displayName: credentials.displayName ?? "" })
        setPendingEmail(accepted.email)
        return
      }
      const user: AuthUser = await loginRequest(credentials.email, credentials.password)
      queryClient.setQueryData(CURRENT_USER_QUERY_KEY, user)
      navigate(from, { replace: true })
    } catch (cause) {
      setError(messageFor(cause))
      if (cause instanceof ApiRequestError && cause.code === "EMAIL_NOT_VERIFIED") setUnverifiedEmail(credentials.email)
    } finally {
      setSubmitting(false)
    }
  }

  if (currentUser.isPending) return <PageLoading label={t("auth.sessionChecking")} />
  if (currentUser.data) return <Navigate to={from} replace />

  if (pendingEmail) {
    return (
      <RegisterVerification
        email={pendingEmail}
        resend={resendState}
        onResend={() => void resend({ email: pendingEmail })}
        onChangeEmail={() => {
          setPendingEmail(null)
          setError(null)
          setMode("register")
        }}
        onBackToLogin={() => {
          setPendingEmail(null)
          setError(null)
          setMode("login")
        }}
      />
    )
  }

  return (
    <LoginForm
      mode={mode}
      onModeChange={(next) => {
        setMode(next)
        setError(null)
        setUnverifiedEmail(null)
      }}
      onSubmit={submit}
      submitting={submitting}
      error={error}
      initialEmail={lastEmail}
      notice={
        unverifiedEmail ? (
          <LoginVerificationNotice resend={resendState} onResend={() => void resend({ email: unverifiedEmail })} disabled={submitting} />
        ) : null
      }
    />
  )
}

function messageFor(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "ACCOUNT_BANNED") return i18n.t("auth.errors.accountBanned")
    if (cause.code === "INVALID_CREDENTIALS") return i18n.t("auth.errors.invalidCredentials")
    if (cause.code === "EMAIL_ALREADY_REGISTERED") return i18n.t("auth.errors.emailRegistered")
    if (cause.code === "EMAIL_NOT_VERIFIED") return i18n.t("auth.errors.emailNotVerified")
    if (cause.code === "VERIFICATION_TOKEN_INVALID") return i18n.t("auth.errors.verificationTokenInvalid")
    if (cause.code === "RESEND_TOO_SOON") return i18n.t("auth.errors.resendTooSoon")
    if (cause.code === "RATE_LIMITED") return i18n.t("auth.errors.rateLimited")
    if (cause.code === "NETWORK_ERROR") return i18n.t("auth.errors.network")
    return cause.message // error-message-allow: 遗留兜底，待把机器错误码映射到 i18n 文案（Issue 6a58a）
  }
  return i18n.t("auth.errors.generic")
}
