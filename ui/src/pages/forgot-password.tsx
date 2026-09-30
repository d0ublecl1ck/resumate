// SCR-000 /forgot-password（容器）：输入注册邮箱 → 中性「已发送」态 + 重发冷却（b5586）。
// 提交由用户动作触发，挂载不发请求；成功后沿用 lib/password-reset 的真实状态机。
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { ForgotPasswordForm } from "@/components/forgot-password-form"
import { ForgotPasswordSent } from "@/components/forgot-password-sent"
import { usePasswordResetResend } from "@/lib/password-reset"

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { resend, resendState, reset } = usePasswordResetResend()
  const [email, setEmail] = useState("")

  if (resendState.status === "cooldown") {
    return (
      <ForgotPasswordSent
        email={resendState.sentEmail ?? email}
        resend={resendState}
        onResend={() => void resend({ email })}
        onChangeEmail={() => {
          reset()
          setEmail("")
        }}
        onBackToLogin={() => navigate("/login", { replace: true })}
      />
    )
  }

  return (
    <ForgotPasswordForm
      onSubmit={(values) => {
        setEmail(values.email)
        void resend(values)
      }}
      submitting={resendState.status === "sending"}
      error={resendState.status === "error" ? (resendState.errorMessage ?? null) : null}
      initialEmail={email}
      onBackToLogin={() => navigate("/login", { replace: true })}
    />
  )
}
