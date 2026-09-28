// 盖章状态戳：2px 墨边 + 硬投影 + 固定小角度旋转。状态始终带文字，不靠颜色单独表达。
import type { CSSProperties, ReactNode } from "react"

import { cn } from "@/lib/utils"

export type StampTone = "neutral" | "cobalt" | "coral" | "gold"

const TONE: Record<StampTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  cobalt: "bg-cobalt text-white",
  coral: "bg-coral text-foreground",
  gold: "bg-gold text-foreground",
}

export function StampBadge({
  tone = "neutral",
  tilt = -3,
  className,
  style,
  children,
  ...rest
}: {
  tone?: StampTone
  tilt?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 border-foreground px-3 py-1 text-xs font-black tracking-wide shadow-[2px_2px_0_var(--foreground)]",
        TONE[tone],
        tilt !== 0 && "rotate-[var(--stamp-tilt)]",
        className,
      )}
      style={tilt !== 0 ? ({ ...style, "--stamp-tilt": `${tilt}deg` } as CSSProperties) : style}
      {...rest}
    >
      {children}
    </span>
  )
}
