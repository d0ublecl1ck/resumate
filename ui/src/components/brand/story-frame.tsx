// Storybook 展示舞台：统一背景、间距与换行，避免每个 story 重复版式。
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function Stage({
  children,
  className,
  direction = "row",
}: {
  children: ReactNode
  className?: string
  direction?: "row" | "column"
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-6 bg-background p-8",
        direction === "column" && "flex-col",
        className,
      )}
    >
      {children}
    </div>
  )
}
