// 品牌空态：用吉祥物姿态承担空 / 加载 / 错误 / 冲突 / 无权限 / 冻结六态，替代图标圆圈。
// 姿态与滤镜表达语气，标题与说明承担信息；错误与冲突用 alert 播报并给出机器错误码。
// size 是尺寸档（quiet 内联 / default 居中 / hero 首屏）。
// mascot 是音量档：pose 角色出面；badge 只留标志徽章，语气改由标题颜色承担。
import type { HTMLAttributes, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { BRAND_MARK_SRC, MASCOT_POSE_SRC, type MascotPose } from "./brand-assets"

export type MascotStateKind = "empty" | "loading" | "error" | "conflict" | "forbidden" | "frozen"
export type MascotStateSize = "quiet" | "default" | "hero"
export type MascotStateMascot = "pose" | "badge"

const KIND: Record<MascotStateKind, { pose: MascotPose; image: string; alert: boolean }> = {
  empty: { pose: "wave", image: "", alert: false },
  loading: { pose: "hero", image: "motion-safe:animate-pulse", alert: false },
  error: { pose: "hero", image: "", alert: true },
  conflict: { pose: "hero", image: "", alert: true },
  forbidden: { pose: "hero", image: "grayscale opacity-70", alert: false },
  frozen: { pose: "hero", image: "grayscale contrast-75 opacity-80", alert: false },
}

// 徽章档没有姿态承担语气，改用标题颜色区分语义，沿用既有状态块的颜色约定。
// 徽章档保留原图标语义：不可用态降饱和，避免六态只靠标题颜色区分。
const BADGE_IMAGE: Partial<Record<MascotStateKind, string>> = {
  forbidden: "grayscale opacity-70",
  frozen: "grayscale contrast-75 opacity-80",
}

const BADGE_TONE: Record<MascotStateKind, string> = {
  empty: "text-foreground",
  loading: "text-cobalt",
  error: "text-coral",
  conflict: "text-coral",
  forbidden: "text-muted-foreground",
  frozen: "text-muted-foreground",
}

const SIZE: Record<
  MascotStateSize,
  { root: string; pose: string; badge: string; title: string; description: string }
> = {
  quiet: {
    root: "flex-row items-center gap-3 px-4 py-4 text-left",
    pose: "size-12",
    badge: "size-6",
    title: "text-base",
    description: "text-sm leading-5",
  },
  default: {
    root: "flex-col items-center gap-4 px-6 py-12 text-center",
    pose: "size-24 -rotate-2",
    badge: "size-12",
    title: "text-lg",
    description: "mx-auto max-w-sm text-sm leading-6",
  },
  hero: {
    root: "flex-col items-center gap-5 px-8 py-16 text-center",
    pose: "size-36 -rotate-2",
    badge: "size-16",
    title: "text-xl",
    description: "mx-auto max-w-md text-base leading-7",
  },
}

export function MascotState({
  kind,
  size = "default",
  mascot = "pose",
  title,
  description,
  errorCode,
  action,
  className,
  ...rest
}: {
  kind: MascotStateKind
  size?: MascotStateSize
  mascot?: MascotStateMascot
  title?: string
  description?: string
  errorCode?: string
  action?: ReactNode
  className?: string
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const { t } = useTranslation()
  const meta = KIND[kind]
  const sizes = SIZE[size]
  const badge = mascot === "badge"

  return (
    <div
      role={meta.alert ? "alert" : undefined}
      className={cn(
        "flex rounded-2xl border-2 border-dashed border-foreground/25 bg-card/60",
        sizes.root,
        className,
      )}
      {...rest}
    >
      <img
        src={badge ? BRAND_MARK_SRC : MASCOT_POSE_SRC[meta.pose]}
        alt=""
        aria-hidden
        draggable={false}
        className={cn(
          "shrink-0 select-none",
          badge ? sizes.badge : sizes.pose,
          badge
            ? [BADGE_IMAGE[kind], kind === "loading" && "motion-safe:animate-pulse"]
            : meta.image,
        )}
      />
      <div className="space-y-1">
        <p
          className={cn(
            "font-serif font-bold text-balance",
            sizes.title,
            badge ? BADGE_TONE[kind] : "text-foreground",
          )}
        >
          {title ?? t(`brand.state.${kind}.title`)}
        </p>
        <p className={cn("text-muted-foreground text-pretty", sizes.description)}>
          {description ?? t(`brand.state.${kind}.description`)}
        </p>
        {errorCode ? (
          <p className="font-mono text-xs text-coral">{t("common.pageState.errorCode", { code: errorCode })}</p>
        ) : null}
      </div>
      {action ? <div className={cn(size === "quiet" ? "ml-auto shrink-0" : "pt-1")}>{action}</div> : null}
    </div>
  )
}
