// 品牌标志：库内资产 ui/public/brand/。默认装饰，可访问名称由可见字标或调用方文字承担。
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

import { BRAND_MARK_SRC } from "./brand-assets"

const MARK_SIZE = { sm: "size-7", md: "size-9", lg: "size-14" } as const
const WORDMARK_SIZE = { sm: "text-base", md: "text-xl", lg: "text-3xl" } as const

export type BrandSize = keyof typeof MARK_SIZE

export function BrandMark({
  size = "md",
  label,
  className,
}: {
  size?: BrandSize
  label?: string
  className?: string
}) {
  return (
    <img
      src={BRAND_MARK_SRC}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      draggable={false}
      className={cn("shrink-0 select-none", MARK_SIZE[size], className)}
    />
  )
}

export function BrandLockup({
  size = "md",
  orientation = "horizontal",
  className,
}: {
  size?: BrandSize
  orientation?: "horizontal" | "vertical"
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5",
        orientation === "vertical" && "flex-col",
        className,
      )}
    >
      <BrandMark size={size} label={t("brand.markAlt")} />
      <span className={cn("font-black tracking-tight text-foreground", WORDMARK_SIZE[size])}>
        {t("brand.name")}
      </span>
    </span>
  )
}
