import { Link, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/settings", label: "Agent 与偏好" },
  { href: "/settings/access", label: "开放接入与审计" },
  { href: "/settings/backup", label: "备份与迁移" },
]

export function SettingsNav() {
  const pathname = useLocation().pathname
  return (
    <nav aria-label="设置分区" className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
      {TABS.map((t) => {
        const active = pathname === t.href
        return (
          <Link
            key={t.href}
            to={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("rounded-md px-4 py-1.5 text-sm font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
