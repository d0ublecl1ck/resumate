import { Link, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

const TABS = [
  { href: "/settings", labelKey: "settings.nav.agent" },
  { href: "/settings/access", labelKey: "settings.nav.access" },
  { href: "/settings/backup", labelKey: "settings.nav.backup" },
]

export function SettingsNav() {
  const { t } = useTranslation()
  const pathname = useLocation().pathname
  return (
    <nav aria-label={t("settings.nav.aria")} className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            to={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn("rounded-md px-4 py-1.5 text-sm font-medium transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}
          >
            {t(tab.labelKey)}
          </Link>
        )
      })}
    </nav>
  )
}
