// DES-010 筛选与查询工具条：关键词 + 标签/状态过滤，可逐项清除。

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Search, X } from "lucide-react"

export function FilterToolbar({
  query,
  onQuery,
  placeholder,
  chips = [],
  activeChip,
  onChip,
  right,
}: {
  query: string
  onQuery: (v: string) => void
  placeholder?: string
  chips?: { key: string; label: string }[]
  activeChip?: string
  onChip?: (key: string) => void
  right?: React.ReactNode
}) {
  const { t } = useTranslation()
  const hint = placeholder ?? t("common.search.placeholder")
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={hint}
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-9 pr-8 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
          aria-label={hint}
        />
        {query ? (
          <button onClick={() => onQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary" aria-label={t("common.actions.clearSearch")}>
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      {chips.length ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => onChip?.(c.key)}
              aria-pressed={activeChip === c.key}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                activeChip === c.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
      {right ? <div className="ml-auto">{right}</div> : null}
    </div>
  )
}

// 页头：标题 + 描述 + 右侧动作，供各 Page 复用
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="space-y-1">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground text-balance">{title}</h1>
        {description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
