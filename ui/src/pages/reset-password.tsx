// SCR-000 /reset-password（容器）：用邮件里的一次性令牌设置新密码（b5586）。
// 令牌只在用户提交时发出——挂载不发请求，因此 StrictMode 的 mount → cleanup → mount
// 不可能丢掉结果；不要为它引入「run-once ref + cleanup 取消标志」的组合（62adb 形态）。
import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { resetPassword } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { passwordResetSubmitErrorMessage } from "@/lib/password-reset"
import { ResetPasswordForm } from "@/components/reset-password-form"
import { ResetPasswordResult, type ResetInvalidReason } from "@/components/reset-password-result"

type ResetPhase = "form" | "success" | "invalid"

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [phase, setPhase] = useState<ResetPhase>(token ? "form" : "invalid")
  const [reason, setReason] = useState<ResetInvalidReason | undefined>(token ? undefined : "malformed")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(values: { password: string }) {
    setError(null)
    setSubmitting(true)
    try {
      await resetPassword({ token, newPassword: values.password })
      setPhase("success")
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.code === "PASSWORD_RESET_TOKEN_INVALID") {
        setReason(undefined)
        setError(passwordResetSubmitErrorMessage(cause))
        setPhase("invalid")
        return
      }
      setError(passwordResetSubmitErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === "success") {
    return <ResetPasswordResult state="success" onGoToLogin={() => navigate("/login", { replace: true })} />
  }

  if (phase === "invalid") {
    return (
      <ResetPasswordResult
        state="invalid"
        reason={reason}
        error={error ?? undefined}
        onRequestNewLink={() => navigate("/forgot-password", { replace: true })}
        onGoToLogin={() => navigate("/login", { replace: true })}
      />
    )
  }

  return (
    <ResetPasswordForm
      onSubmit={(values) => void submit(values)}
      submitting={submitting}
      error={error}
      onBackToLogin={() => navigate("/login", { replace: true })}
    />
  )
}
