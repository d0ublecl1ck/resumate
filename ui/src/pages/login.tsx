// SCR-000 登录页（容器）：调用 /auth/login 或 /auth/register，成功后写入会话缓存并跳转。
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { login as loginRequest, register as registerRequest } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { CURRENT_USER_QUERY_KEY, useCurrentUser } from "@/lib/session"
import { LoginForm, type LoginCredentials, type LoginMode } from "@/components/login-form"
import { PageLoading } from "@/pages/states"
import type { AuthUser } from "@/lib/types"

export function LoginPage() {
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

  if (currentUser.isPending) return <PageLoading label="正在校验登录状态…" />
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
    if (cause.code === "ACCOUNT_BANNED") return "账号已被封禁，请联系管理员。"
    if (cause.code === "INVALID_CREDENTIALS") return "邮箱或密码不正确。"
    if (cause.code === "EMAIL_ALREADY_REGISTERED") return "该邮箱已注册，直接登录即可。"
    if (cause.code === "NETWORK_ERROR") return "无法连接后端服务，请确认服务已启动。"
    return cause.message
  }
  return "操作失败，请稍后重试。"
}
