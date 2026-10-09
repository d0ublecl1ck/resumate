// 应用外壳：承载可收起的侧边栏。收起后侧栏变窄（仅图标），把空间让给右侧内容区。
// 折叠状态持久化到 localStorage，刷新后保持。

import { useState } from "react"
import { AppNav, MobileNav } from "@/components/app-nav"
import { ThemeSync } from "@/components/theme-sync"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "resumate.sidebar.collapsed"

/**
 * 外壳宽度契约（宽度策略的单一出处）：页面类型 → main 宽度类名。
 * 每条路由用哪一档在 App.tsx 路由表上显式声明，页面自身不写 max-w-*。
 *
 * - fluid：工作区型页面（多栏工作台、编辑器、双栏对照）。不设上限，吃满侧栏之外的可用宽度，
 *   视口越宽用得越多。列比例由页面内部栅格决定，外壳不再二次钳制。
 * - readable：阅读/表单型页面（设置、库列表、版本历史等单列文本与表单）。保留
 *   72rem = 1152px 上限：16px 基准字号下西文正文舒适行宽约 65–75 字符，72rem 落在这个区间，
 *   中文约 36 字/行；单列内容超过上限会拉长视线回扫，因此有意保留。
 */
export type ShellWidth = "fluid" | "readable"

export const SHELL_WIDTH: Record<ShellWidth, string> = {
  fluid: "w-full",
  readable: "mx-auto w-full max-w-6xl",
}

export function AppShell({
  children,
  width = "readable",
}: {
  children: React.ReactNode
  width?: ShellWidth
}) {
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
        <main className={cn("flex-1 px-5 py-8 sm:px-8", SHELL_WIDTH[width])}>{children}</main>
      </div>
    </div>
  )
}
