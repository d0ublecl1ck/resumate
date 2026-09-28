// 品牌空态：用吉祥物姿态承担空 / 加载 / 错误 / 无权限 / 冻结五态，替代图标圆圈。
// 姿态与滤镜表达语气，标题与说明承担信息；错误态用 alert 播报并给出机器错误码。
// size 是音量档位：quiet 内联在面板与表格空隙里，default 居中，hero 用于首次进入。
import type { HTMLAttributes, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { MASCOT_POSE_SRC, type MascotPose } from "./brand-assets"

export type MascotStateKind = "empty" | "loading" | "error" | "forbidden" | "frozen"
export type MascotStateSize = "quiet" | "default" | "hero"

const KIND: Record<MascotStateKind, { pose: MascotPose; image: string; alert: boolean }> = {
  empty: { pose: "wave", image: "", alert: false },
  loading: { pose: "hero", image: "motion-safe:animate-pulse", alert: false },
  error: { pose: "hero", image: "", alert: true },
  forbidden: { pose: "hero", image: "grayscale opacity-70", alert: false },
  frozen: { pose: "hero", image: "grayscale contrast-75 opacity-80", alert: false },
}

const SIZE: Record<MascotStateSize, { root: string; image: string; title: string; description: string }> = {
  quiet: {
    root: "flex-row items-center gap-3 px-4 py-4 text-left",
    image: "size-12",
    title: "text-base",
    description: "text-sm leading-5",
  },
  default: {
    root: "flex-col items-center gap-4 px-6 py-12 text-center",
    image: "size-24 -rotate-2",
    title: "text-lg",
    description: "mx-auto max-w-sm text-sm leading-6",
  },
  hero: {
    root: "flex-col items-center gap-5 px-8 py-16 text-center",
    image: "size-36 -rotate-2",
    title: "text-xl",
    description: "mx-auto max-w-md text-base leading-7",
  },
}

export function MascotState({
  kind,
  size = "default",
  title,
  description,
  errorCode,
  action,
  className,
  ...rest
}: {
  kind: MascotStateKind
  size?: MascotStateSize
  title?: string
  description?: string
  errorCode?: string
  action?: ReactNode
  className?: string
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const { t } = useTranslation()
  const meta = KIND[kind]
  const sizes = SIZE[size]

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
        src={MASCOT_POSE_SRC[meta.pose]}
        alt=""
        aria-hidden
        draggable={false}
        className={cn("shrink-0 select-none", sizes.image, meta.image)}
      />
      <div className="space-y-1">
        <p className={cn("font-serif font-bold text-foreground text-balance", sizes.title)}>
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
