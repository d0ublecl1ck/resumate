// 路由守卫：未登录时重定向到 /login，并记录来源以便登录后返回。
import { Navigate, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useCurrentUser } from "@/lib/session"
import { PageLoading } from "@/pages/states"

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const location = useLocation()
  const { data, isPending, isError } = useCurrentUser()

  if (isPending) return <PageLoading label={t("auth.sessionChecking")} />
  if (isError || !data) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}
