// DES-008 版本时间线：不可变条目，展示来源、作者、模式、父子关系。
// 支持选择两个版本进行非相邻比较。

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { ResumeVersion, VersionSource } from "@/lib/types"
import { GitCommitVertical } from "lucide-react"

const SOURCE_META: Record<VersionSource, { labelKey: string; tone: string }> = {
  manual: { labelKey: "common.versionSource.manual", tone: "text-foreground border-foreground/25 bg-secondary" },
  agent: { labelKey: "common.versionSource.agent", tone: "text-cobalt border-cobalt/40 bg-cobalt/5" },
  client: { labelKey: "common.versionSource.client", tone: "text-muted-foreground border-border bg-muted" },
  import: { labelKey: "common.versionSource.import", tone: "text-muted-foreground border-border bg-muted" },
  restore: { labelKey: "common.versionSource.restore", tone: "text-foreground border-gold/70 bg-gold/20" },
}

export function VersionTimeline({
  versions,
  currentVersionId,
  selected = [],
  onToggleSelect,
  onRestore,
}: {
  versions: ResumeVersion[]
  currentVersionId?: string
  selected?: string[]
  onToggleSelect?: (id: string) => void
  onRestore?: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <ol className="relative space-y-3 pl-6">
      <span className="absolute left-[9px] top-2 bottom-2 w-px bg-border" aria-hidden />
      {versions.map((v) => {
        const meta = SOURCE_META[v.source]
        const isCurrent = v.id === currentVersionId
        const isSelected = selected.includes(v.id)
        const sections = v.affectedSections.join(t("common.listSeparator")) || t("common.pageState.noSectionRecord")
        return (
          <li key={v.id} className="relative">
            <span className={cn("absolute -left-[18px] top-1.5 flex size-4 items-center justify-center rounded-full border-2 bg-background", isCurrent ? "border-cobalt" : "border-border")} aria-hidden>
              <GitCommitVertical className="size-2.5 text-muted-foreground" />
            </span>
            <div className={cn("rounded-lg border p-3", isSelected ? "border-cobalt bg-cobalt/5" : "border-border bg-card")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("rounded-md border px-1.5 py-0.5 text-[11px] font-medium", meta.tone)}>{t(meta.labelKey)}</span>
                  <code className="font-mono text-xs text-muted-foreground">{v.id}</code>
                  {isCurrent ? <span className="text-[11px] font-semibold text-cobalt">{t("common.version.current")}</span> : null}
                </div>
                <time className="text-xs text-muted-foreground">{formatTime(v.committedAt)}</time>
              </div>
              <p className="mt-1.5 text-sm text-foreground">{v.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("common.version.changeCount", { count: v.changeCount })} · {sections}
                {v.executionMode ? " · " + t("common.version.mode", { mode: t("common.executionMode." + v.executionMode) }) : ""}
                {v.jdRevision ? " · " + t("common.version.jdRevision", { revision: v.jdRevision }) : ""}
              </p>
              {(onToggleSelect || onRestore) && (
                <div className="mt-2 flex gap-2">
                  {onToggleSelect ? (
                    <button
                      onClick={() => onToggleSelect(v.id)}
                      aria-pressed={isSelected}
                      className={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition-colors", isSelected ? "border-cobalt bg-cobalt text-primary-foreground" : "border-border text-foreground hover:bg-secondary")}
                    >
                      {isSelected ? t("common.actions.selectedForCompare") : t("common.actions.selectForCompare")}
                    </button>
                  ) : null}
                  {onRestore && !isCurrent ? (
                    <button onClick={() => onRestore(v.id)} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary">
                      {t("common.actions.restoreAsNew")}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function formatTime(iso: string) {
  return iso.replace("T", " ").slice(0, 16)
}
