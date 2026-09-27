// 应用外壳：承载可收起的侧边栏。收起后侧栏变窄（仅图标），把空间让给右侧内容区。
// 折叠状态持久化到 localStorage，刷新后保持。

import { useState } from "react"
import { AppNav, MobileNav } from "@/components/app-nav"
import { ThemeSync } from "@/components/theme-sync"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "resumate.sidebar.collapsed"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem(STORAGE_KEY) === "1")

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      return next
    })
  }

  return (
    <div className="flex min-h-screen bg-background">
      <ThemeSync />
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-border bg-card/40 transition-[width] duration-200 md:block",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        <AppNav collapsed={collapsed} onToggle={toggle} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  )
}
