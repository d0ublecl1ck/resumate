// DES-001 全局导航与资源上下文条。求职者主导航 + 管理员模板分区。
// 支持收起（collapsed）：仅显示图标，label 通过 title/aria-label 暴露，键盘可达。

import { Link, useLocation, useNavigate } from "react-router-dom"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { logout as logoutRequest } from "@/lib/api"
import { CURRENT_USER_QUERY_KEY, useCurrentUser } from "@/lib/session"
import {
  Boxes,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react"

const MAIN = [
  { href: "/", labelKey: "nav.items.workbench", icon: LayoutDashboard },
  { href: "/resumes", labelKey: "nav.items.resumes", icon: FileText },
  { href: "/profile", labelKey: "nav.items.profile", icon: UserRound },
  { href: "/jds", labelKey: "nav.items.jds", icon: Boxes },
  { href: "/settings", labelKey: "nav.items.settings", icon: Settings },
]

const ADMIN = [
  { href: "/admin/templates", labelKey: "nav.items.templates", icon: Boxes, permission: "user:read" },
  { href: "/admin/rbac", labelKey: "nav.items.rbac", icon: ShieldCheck, permission: "role:write" },
]

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname.startsWith(href)
}

function NavItem({
  href,
  label,
  Icon,
  active,
  collapsed,
}: {
  href: string
  label: string
  Icon: typeof LayoutDashboard
  active: boolean
  collapsed: boolean
}) {
  return (
    <Link
      to={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-lg text-sm font-medium transition-colors",
        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      {collapsed ? <span className="sr-only">{label}</span> : label}
    </Link>
  )
}

export function AppNav({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  const { t } = useTranslation()
  const pathname = useLocation().pathname
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const user = useCurrentUser().data
  const displayName = user?.displayName ?? t("nav.role.anonymous")
  const roleLabel =
    user?.role === "super_admin"
      ? t("nav.role.superAdmin")
      : user?.role === "admin"
        ? t("nav.role.admin")
        : t("nav.role.jobseeker")
  // 管理分区按 RBAC 权限显示，而不是硬编码角色。
  const adminItems = user ? ADMIN.filter((item) => user.permissions.includes(item.permission)) : []
  const canManage = adminItems.length > 0

  async function handleLogout() {
    try {
      await logoutRequest()
    } finally {
      queryClient.removeQueries({ queryKey: CURRENT_USER_QUERY_KEY })
      navigate("/login", { replace: true })
    }
  }

  return (
    <nav aria-label={t("nav.aria.main")} className="flex h-full flex-col gap-1 p-3">
      <div className={cn("mb-4", collapsed ? "flex flex-col items-center gap-2" : "flex items-center justify-between px-1")}>
        <Link to="/" className="flex items-center gap-2.5" title={t("nav.brand.name")}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-5" aria-hidden />
          </span>
          {!collapsed && (
            <span>
              <span className="block font-serif text-lg font-bold leading-none text-foreground">{t("nav.brand.name")}</span>
              <span className="block text-[11px] text-muted-foreground">{t("nav.brand.tagline")}</span>
            </span>
          )}
        </Link>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? t("nav.aria.expandSidebar") : t("nav.aria.collapseSidebar")}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
          </button>
        ) : null}
      </div>

      <ul className="space-y-1">
        {MAIN.map((item) => (
          <li key={item.href}>
            <NavItem href={item.href} label={t(item.labelKey)} Icon={item.icon} active={isActive(pathname, item.href)} collapsed={collapsed} />
          </li>
        ))}
      </ul>

      {canManage ? (
        <>
          {collapsed ? (
            <div className="my-3 border-t border-border" />
          ) : (
            <div className="mb-2 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("nav.group.admin")}</div>
          )}
          <ul className="space-y-1">
            {adminItems.map((item) => (
              <li key={item.href}>
                <NavItem href={item.href} label={t(item.labelKey)} Icon={item.icon} active={isActive(pathname, item.href)} collapsed={collapsed} />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-auto space-y-2">
        <div
          className={cn(
            "flex items-center rounded-lg border border-border bg-card",
            collapsed ? "justify-center p-2" : "gap-2.5 p-2.5",
          )}
          title={collapsed ? displayName : undefined}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cobalt/15 text-sm font-bold text-cobalt">
            {displayName.slice(0, 1)}
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? t("nav.actions.logout") : undefined}
          className={cn(
            "flex w-full items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
            collapsed ? "justify-center py-2" : "gap-3 px-3 py-2",
          )}
        >
          <LogOut className="size-5 shrink-0" aria-hidden />
          {collapsed ? <span className="sr-only">{t("nav.actions.logout")}</span> : t("nav.actions.logout")}
        </button>
      </div>
    </nav>
  )
}

// 窄屏（< md）顶部导航：品牌 + 汉堡菜单，展开后复用同一套主/管理员链接。
export function MobileNav() {
  const { t } = useTranslation()
  const pathname = useLocation().pathname
  const [open, setOpen] = useState(false)
  const user = useCurrentUser().data
  const links = [...MAIN, ...(user ? ADMIN.filter((item) => user.permissions.includes(item.permission)) : [])]

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="font-serif text-base font-bold leading-none text-foreground">{t("nav.brand.name")}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav-menu"
          className="flex size-9 items-center justify-center rounded-lg border border-border text-foreground hover:bg-secondary"
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          <span className="sr-only">{open ? t("nav.aria.closeMenu") : t("nav.aria.openMenu")}</span>
        </button>
      </div>

      {open && (
        <nav id="mobile-nav-menu" aria-label={t("nav.aria.main")} className="border-t border-border px-3 pb-3 pt-2">
          <ul className="space-y-1">
            {links.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    to={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
                    )}
                  >
                    <Icon className="size-5 shrink-0" aria-hidden />
                    {t(item.labelKey)}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </header>
  )
}
