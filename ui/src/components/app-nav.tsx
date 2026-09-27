// DES-001 全局导航与资源上下文条。求职者主导航 + 管理员模板分区。
// 支持收起（collapsed）：仅显示图标，label 通过 title/aria-label 暴露，键盘可达。

import { Link, useLocation } from "react-router-dom"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { CURRENT_USER } from "@/lib/content"
import {
  Boxes,
  FileText,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  UserRound,
  X,
} from "lucide-react"

const MAIN = [
  { href: "/", label: "工作台", icon: LayoutDashboard },
  { href: "/resumes", label: "简历库", icon: FileText },
  { href: "/profile", label: "个人资料", icon: UserRound },
  { href: "/jds", label: "JD 库", icon: Boxes },
  { href: "/settings", label: "设置与 Agent", icon: Settings },
]

const ADMIN = [{ href: "/admin/templates", label: "模板库", icon: Boxes }]

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
  const pathname = useLocation().pathname
  return (
    <nav aria-label="主导航" className="flex h-full flex-col gap-1 p-3">
      <div className={cn("mb-4", collapsed ? "flex flex-col items-center gap-2" : "flex items-center justify-between px-1")}>
        <Link to="/" className="flex items-center gap-2.5" title="Resumate">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-5" aria-hidden />
          </span>
          {!collapsed && (
            <span>
              <span className="block font-serif text-lg font-bold leading-none text-foreground">Resumate</span>
              <span className="block text-[11px] text-muted-foreground">对话式简历工作台</span>
            </span>
          )}
        </Link>
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
          </button>
        ) : null}
      </div>

      <ul className="space-y-1">
        {MAIN.map((item) => (
          <li key={item.href}>
            <NavItem href={item.href} label={item.label} Icon={item.icon} active={isActive(pathname, item.href)} collapsed={collapsed} />
          </li>
        ))}
      </ul>

      {collapsed ? (
        <div className="my-3 border-t border-border" />
      ) : (
        <div className="mb-2 mt-5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">管理员</div>
      )}
      <ul className="space-y-1">
        {ADMIN.map((item) => (
          <li key={item.href}>
            <NavItem href={item.href} label={item.label} Icon={item.icon} active={isActive(pathname, item.href)} collapsed={collapsed} />
          </li>
        ))}
      </ul>

      <div
        className={cn(
          "mt-auto flex items-center rounded-lg border border-border bg-card",
          collapsed ? "justify-center p-2" : "gap-2.5 p-2.5",
        )}
        title={collapsed ? CURRENT_USER.displayName : undefined}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cobalt/15 text-sm font-bold text-cobalt">
          {CURRENT_USER.displayName.slice(0, 1)}
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{CURRENT_USER.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">求职者</p>
          </div>
        )}
      </div>
    </nav>
  )
}

// 窄屏（< md）顶部导航：品牌 + 汉堡菜单，展开后复用同一套主/管理员链接。
export function MobileNav() {
  const pathname = useLocation().pathname
  const [open, setOpen] = useState(false)
  const links = [...MAIN, ...ADMIN]

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <span className="font-serif text-base font-bold leading-none text-foreground">Resumate</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav-menu"
          className="flex size-9 items-center justify-center rounded-lg border border-border text-foreground hover:bg-secondary"
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          <span className="sr-only">{open ? "关闭菜单" : "打开菜单"}</span>
        </button>
      </div>

      {open && (
        <nav id="mobile-nav-menu" aria-label="主导航" className="border-t border-border px-3 pb-3 pt-2">
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
                    {item.label}
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
