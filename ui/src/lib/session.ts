// 会话查询：当前用户来自后端 /auth/me（HttpOnly Cookie 由浏览器自动携带）。
import { useQuery } from "@tanstack/react-query"
import { getCurrentUser } from "@/lib/api"

export const CURRENT_USER_QUERY_KEY = ["auth", "me"] as const

export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: getCurrentUser,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}
