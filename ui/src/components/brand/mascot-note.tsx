// 吉祥物对话气泡：让 Agent 用角色形象开口，替代通用头像 + 灰底提示条。
// 语气只改变气泡底色，文字始终是唯一信息源；pending 时用实时区域播报，不保留旧回复。
// mascot 是音量档位：full 角色出面 / badge 只留标志徽章 / none 完全中立。
import type { HTMLAttributes, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { BRAND_MARK_SRC, MASCOT_POSE_SRC, type MascotPose } from "./brand-assets"

export type MascotNoteTone = "hint" | "praise" | "warn" | "ask"
export type MascotNoteMascot = "full" | "badge" | "none"

const BUBBLE_TONE: Record<MascotNoteTone, string> = {
  hint: "bg-card text-card-foreground",
  praise: "bg-gold text-foreground",
  warn: "bg-coral text-foreground",
  ask: "bg-cobalt text-white",
}

const MASCOT_SIZE: Record<Exclude<MascotNoteMascot, "none">, string> = {
  full: "size-14 -rotate-3",
  badge: "size-9",
}

const PENDING_DELAYS = [0, 150, 300] as const

export function MascotNote({
  pose = "hero",
  tone = "hint",
  tail = "start",
  mascot = "full",
  pending = false,
  action,
  className,
  children,
  ...rest
}: {
  pose?: MascotPose
  tone?: MascotNoteTone
  tail?: "start" | "end"
  mascot?: MascotNoteMascot
  pending?: boolean
  action?: ReactNode
  className?: string
  children?: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const { t } = useTranslation()

  return (
    <div
      data-tail={tail}
      data-mascot={mascot}
      className={cn("flex items-start gap-3", tail === "end" && "flex-row-reverse", className)}
      {...rest}
    >
      {mascot === "none" ? null : (
        <img
          src={mascot === "badge" ? BRAND_MARK_SRC : MASCOT_POSE_SRC[pose]}
          alt=""
          aria-hidden
          draggable={false}
          className={cn("shrink-0 select-none", MASCOT_SIZE[mascot])}
        />
      )}
      <div
        className={cn(
          "relative min-w-0 flex-1 rounded-2xl border-2 border-foreground px-4 py-3 shadow-[3px_3px_0_var(--foreground)]",
          BUBBLE_TONE[tone],
        )}
      >
        {mascot === "none" ? null : (
          <span
            aria-hidden
            className={cn(
              "absolute top-5 size-3 rotate-45 border-foreground bg-inherit",
              tail === "start" ? "-left-[7px] border-b-2 border-l-2" : "-right-[7px] border-t-2 border-r-2",
            )}
          />
        )}
        {pending ? (
          <span role="status" className="flex items-center gap-1.5 py-1">
            <span className="sr-only">{t("brand.pending")}</span>
            {PENDING_DELAYS.map((delay) => (
              <span
                key={delay}
                aria-hidden
                style={{ animationDelay: `${delay}ms` }}
                className="size-2 rounded-full bg-current opacity-40 motion-safe:animate-bounce"
              />
            ))}
          </span>
        ) : (
          <div className="space-y-2">
            <div className="text-sm leading-6 font-medium text-pretty">{children}</div>
            {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
          </div>
        )}
      </div>
    </div>
  )
}
