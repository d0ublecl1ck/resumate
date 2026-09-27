// 把保存的主题偏好应用到 <html>：.dark 令牌定义在 src/index.css。
// 与设置页共用 ["preferences"] 查询缓存，保存后立即生效。

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { getPreferences } from "@/lib/api"

export function ThemeSync() {
  const { data } = useQuery({ queryKey: ["preferences"], queryFn: getPreferences })

  useEffect(() => {
    document.documentElement.classList.toggle("dark", data?.theme === "dark")
  }, [data?.theme])

  return null
}
