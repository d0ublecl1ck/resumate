// DES-005 Diff 项。读屏顺序：目标 → 原值 → 新值 → 理由 → 来源 → 操作。
// 变化类型同时用文字与图标表达，不只靠颜色。

import { cn } from "@/lib/utils"
import type { DiffItem } from "@/lib/types"
import { SourceBadge } from "./badges"
import { Check, Minus, Pencil, Plus, X } from "lucide-react"

const TYPE_META = {
  added: { label: "新增", icon: Plus, tone: "text-cobalt border-cobalt/40" },
  removed: { label: "删除", icon: Minus, tone: "text-coral border-coral/40" },
  modified: { label: "修改", icon: Pencil, tone: "text-foreground border-foreground/30" },
} as const

export function DiffItemCard({
  item,
  onAccept,
  onReject,
  onEdit,
}: {
  item: DiffItem
  onAccept?: (id: string) => void
  onReject?: (id: string) => void
  onEdit?: (id: string) => void
}) {
  const meta = TYPE_META[item.changeType]
  const Icon = meta.icon
  const decided = item.state === "accepted" || item.state === "rejected"
  return (
    <div className={cn("rounded-lg border bg-card p-3", item.state === "stale" ? "border-dashed border-border opacity-70" : "border-border")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", meta.tone)}>
            <Icon className="size-3" aria-hidden /> {meta.label}
          </span>
          <span className="text-sm font-medium text-foreground">{item.target}</span>
        </div>
        {item.state === "accepted" ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-cobalt"><Check className="size-3.5" /> 已接受</span>
        ) : item.state === "rejected" ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><X className="size-3.5" /> 已拒绝</span>
        ) : item.state === "stale" ? (
          <span className="text-xs font-medium text-coral">确认已失效</span>
        ) : item.state === "dependency_error" ? (
          <span className="text-xs font-medium text-coral">依赖错误</span>
        ) : null}
      </div>

      <div className="mt-2 space-y-1.5 text-sm">
        {item.before ? (
          <p className="rounded bg-coral/5 px-2 py-1 text-muted-foreground line-through decoration-coral/50">{item.before}</p>
        ) : null}
        {item.after ? <p className="rounded bg-cobalt/5 px-2 py-1 text-foreground">{item.after}</p> : null}
      </div>

      <p className="mt-2 text-xs leading-5 text-muted-foreground">理由：{item.reason}</p>
      {item.provenance ? <div className="mt-2"><SourceBadge provenance={item.provenance} /></div> : null}

      {!decided && item.state === "pending" && (onAccept || onReject || onEdit) ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {onAccept ? (
            <button onClick={() => onAccept(item.id)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              接受
            </button>
          ) : null}
          {onEdit ? (
            <button onClick={() => onEdit(item.id)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary">
              编辑后接受
            </button>
          ) : null}
          {onReject ? (
            <button onClick={() => onReject(item.id)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary">
              拒绝
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
