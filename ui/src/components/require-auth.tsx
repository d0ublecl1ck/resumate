// 路由守卫：未登录时重定向到 /login，并记录来源以便登录后返回。
import { Navigate, useLocation } from "react-router-dom"
import { useCurrentUser } from "@/lib/session"
import { PageLoading } from "@/pages/states"

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { data, isPending, isError } = useCurrentUser()

  if (isPending) return <PageLoading label="正在校验登录状态…" />
  if (isError || !data) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}
