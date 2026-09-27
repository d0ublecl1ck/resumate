// DES-012 空 / 加载 / 错误 / 冲突 / 权限不足 / 冻结统一状态块。
// 约束：错误码、用户说明、下一步动作都必须有文本。

import { cn } from "@/lib/utils"
import { AlertTriangle, Ban, Inbox, Loader2, Snowflake, TriangleAlert } from "lucide-react"

type StateKind = "empty" | "loading" | "error" | "conflict" | "forbidden" | "frozen"

const META: Record<StateKind, { icon: React.ElementType; tone: string }> = {
  empty: { icon: Inbox, tone: "text-muted-foreground" },
  loading: { icon: Loader2, tone: "text-cobalt" },
  error: { icon: AlertTriangle, tone: "text-coral" },
  conflict: { icon: TriangleAlert, tone: "text-coral" },
  forbidden: { icon: Ban, tone: "text-muted-foreground" },
  frozen: { icon: Snowflake, tone: "text-muted-foreground" },
}

export function StateBlock({
  kind,
  title,
  description,
  errorCode,
  action,
  className,
}: {
  kind: StateKind
  title: string
  description?: string
  errorCode?: string
  action?: React.ReactNode
  className?: string
}) {
  const meta = META[kind]
  const Icon = meta.icon
  return (
    <div
      role={kind === "error" || kind === "conflict" ? "alert" : undefined}
      className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/60 px-6 py-12 text-center", className)}
    >
      <Icon className={cn("size-8", meta.tone, kind === "loading" && "animate-spin")} aria-hidden />
      <div className="space-y-1">
        <p className="font-serif text-lg font-bold text-foreground text-balance">{title}</p>
        {description ? <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground text-pretty">{description}</p> : null}
        {errorCode ? <p className="font-mono text-xs text-coral">错误码：{errorCode}</p> : null}
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}
