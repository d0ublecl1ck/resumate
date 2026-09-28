// 贴纸卡片：沿用原型 ui/prototypes/index.html 的 2px 墨边 + 硬投影 + 20px 圆角容器语法。
// 交互态渲染为真实 button，并把原型的按压缩放位移（hover -2px / active +2px）保留下来。
import type { CSSProperties, HTMLAttributes, ReactNode } from "react"

import { cn } from "@/lib/utils"

export type StickerTone = "paper" | "cobalt" | "coral" | "gold"
export type StickerLift = "none" | "sm" | "md" | "lg"

const TONE: Record<StickerTone, string> = {
  paper: "bg-card text-card-foreground",
  cobalt: "bg-cobalt text-white",
  coral: "bg-coral text-foreground",
  gold: "bg-gold text-foreground",
}

const LIFT: Record<StickerLift, string> = {
  none: "",
  sm: "shadow-[3px_3px_0_var(--foreground)]",
  md: "shadow-[5px_5px_0_var(--foreground)]",
  lg: "shadow-[8px_8px_0_var(--foreground)]",
}

const PRESS = [
  "cursor-pointer transition-[translate,box-shadow] duration-150 motion-reduce:transition-none",
  "shadow-[3px_3px_0_var(--foreground)]",
  "hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_var(--foreground)]",
  "active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_var(--foreground)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "disabled:pointer-events-none disabled:opacity-50",
].join(" ")

export function StickerCard({
  tone = "paper",
  lift = "sm",
  tilt = 0,
  interactive = false,
  disabled = false,
  className,
  style,
  children,
  ...rest
}: {
  tone?: StickerTone
  lift?: StickerLift
  tilt?: number
  interactive?: boolean
  disabled?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
} & Omit<HTMLAttributes<HTMLElement>, "children">) {
  const classes = cn(
    "rounded-2xl border-2 border-foreground p-5",
    TONE[tone],
    interactive ? PRESS : LIFT[lift],
    tilt !== 0 && "rotate-[var(--sticker-tilt)]",
    className,
  )
  const mergedStyle = tilt !== 0 ? ({ ...style, "--sticker-tilt": `${tilt}deg` } as CSSProperties) : style

  if (interactive) {
    return (
      <button type="button" disabled={disabled} className={classes} style={mergedStyle} {...rest}>
        {children}
      </button>
    )
  }
  return (
    <div className={classes} style={mergedStyle} {...rest}>
      {children}
    </div>
  )
}
