// 品牌空态：用吉祥物姿态承担空 / 加载 / 错误 / 无权限 / 冻结五态，替代图标圆圈。
// 姿态与滤镜表达语气，标题与说明承担信息；错误态用 alert 播报并给出机器错误码。
import type { HTMLAttributes, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { MASCOT_POSE_SRC, type MascotPose } from "./mascot-assets"

export type MascotStateKind = "empty" | "loading" | "error" | "forbidden" | "frozen"

const KIND: Record<MascotStateKind, { pose: MascotPose; image: string; alert: boolean }> = {
  empty: { pose: "wave", image: "", alert: false },
  loading: { pose: "hero", image: "motion-safe:animate-pulse", alert: false },
  error: { pose: "hero", image: "", alert: true },
  forbidden: { pose: "hero", image: "grayscale opacity-70", alert: false },
  frozen: { pose: "hero", image: "grayscale contrast-75 opacity-80", alert: false },
}

export function MascotState({
  kind,
  title,
  description,
  errorCode,
  action,
  className,
  ...rest
}: {
  kind: MascotStateKind
  title?: string
  description?: string
  errorCode?: string
  action?: ReactNode
  className?: string
} & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const { t } = useTranslation()
  const meta = KIND[kind]

  return (
    <div
      role={meta.alert ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-foreground/25 bg-card/60 px-6 py-12 text-center",
        className,
      )}
      {...rest}
    >
      <img
        src={MASCOT_POSE_SRC[meta.pose]}
        alt=""
        aria-hidden
        draggable={false}
        className={cn("size-24 -rotate-2 select-none", meta.image)}
      />
      <div className="space-y-1">
        <p className="font-serif text-lg font-bold text-foreground text-balance">
          {title ?? t(`brand.state.${kind}.title`)}
        </p>
        <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground text-pretty">
          {description ?? t(`brand.state.${kind}.description`)}
        </p>
        {errorCode ? (
          <p className="font-mono text-xs text-coral">{t("common.pageState.errorCode", { code: errorCode })}</p>
        ) : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
