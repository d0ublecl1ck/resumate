// SCR-000 认证页外壳：登录 / 注册 / 邮箱验证共用的居中卡片布局。
// 视觉沿用登录页既有令牌（card-soft / primary / font-serif），仅承载布局与品牌区，不含业务文案。

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export function AuthShell({ children, widthClassName = "max-w-sm" }: { children: ReactNode; widthClassName?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className={cn("w-full", widthClassName)}>
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block font-serif text-lg font-bold leading-none text-foreground">{t("nav.brand.name")}</span>
            <span className="block text-[11px] text-muted-foreground">{t("nav.brand.tagline")}</span>
          </span>
        </div>
        <div className="card-soft p-6">{children}</div>
      </div>
    </div>
  )
}
