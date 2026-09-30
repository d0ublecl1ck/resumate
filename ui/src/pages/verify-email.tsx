// SCR-000 /verify-email：消费邮件里的一次性令牌（d7b99）。
// 成功：写入会话缓存并展示「进入工作台」；失败：失效态 + 按 token 直接重发。
import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate, useSearchParams } from "react-router-dom"
import { verifyEmail } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { CURRENT_USER_QUERY_KEY } from "@/lib/session"
import { useVerificationResend } from "@/lib/verification"
import { VerifyEmailResult, type VerifyInvalidReason, type VerifyState } from "@/components/verify-email-result"

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [state, setState] = useState<VerifyState>(token ? "verifying" : "invalid")
  const [reason, setReason] = useState<VerifyInvalidReason | undefined>(token ? undefined : "malformed")
  const { resend, resendState } = useVerificationResend()
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    // StrictMode 在开发模式会 mount → cleanup → mount。令牌是一次性的，重复请求会让
    // 第二次落到 400，所以这里用 ref 保证只发一次；同时又不能在 cleanup 中把这一次的
    // 结果丢弃，否则页面会永远停在「正在验证邮箱」（62adb）。
    attempted.current = true
    verifyEmail(token)
      .then((user) => {
        queryClient.setQueryData(CURRENT_USER_QUERY_KEY, user)
        setState("success")
      })
      .catch((cause) => {
        setReason(cause instanceof ApiRequestError && cause.code === "VERIFICATION_TOKEN_INVALID" ? "expired" : undefined)
        setState("invalid")
      })
  }, [token, queryClient])

  return (
    <VerifyEmailResult
      state={state}
      reason={reason}
      resend={resendState}
      resendAvailable={token.length > 0}
      onResend={() => void resend({ token })}
      onGoToWorkbench={() => navigate("/", { replace: true })}
      onBackToSignIn={() => navigate("/login", { replace: true })}
    />
  )
}
