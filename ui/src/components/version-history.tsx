// SCR-007 版本历史与比较 + SCR-103 恢复确认 Modal。
// 恢复通过新版本表达，不覆盖历史（C-03）。可比较非相邻两版。

import { Link } from "react-router-dom"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { Resume, ResumeVersion } from "@/lib/types"
import { VersionTimeline } from "@/components/kit/version-timeline"
import { PageHeader } from "@/components/kit/toolbar"
import { StateBlock } from "@/components/kit/state-block"
import { ArrowLeft, GitCompare, X } from "lucide-react"

export function VersionHistory({ resume }: { resume: Resume }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string[]>([])
  const [restoreTarget, setRestoreTarget] = useState<ResumeVersion | null>(null)
  const [sourceFilter, setSourceFilter] = useState<string>("all")

  const versions = resume.versions.filter((v) => (sourceFilter === "all" ? true : v.source === sourceFilter))

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? [prev[1], id] : [...prev, id]))
  }

  const compareA = resume.versions.find((v) => v.id === selected[0])
  const compareB = resume.versions.find((v) => v.id === selected[1])

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("resume.versions.title")}
        description={t("resume.versions.description", { title: resume.title })}
        actions={
          <Link to={`/resumes/${resume.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <ArrowLeft className="size-4" aria-hidden /> {t("resume.versions.backToEditor")}
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("resume.versions.filterBySource")}</span>
        {[
          { k: "all", labelKey: "resume.versions.sourceAll" },
          { k: "manual", labelKey: "common.versionSource.manual" },
          { k: "agent", labelKey: "common.versionSource.agent" },
          { k: "restore", labelKey: "common.versionSource.restore" },
        ].map((f) => (
          <button
            key={f.k}
            onClick={() => setSourceFilter(f.k)}
            aria-pressed={sourceFilter === f.k}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${sourceFilter === f.k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary"}`}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {versions.length ? (
          <VersionTimeline versions={versions} currentVersionId={resume.currentVersionId} selected={selected} onToggleSelect={toggle} onRestore={(id) => setRestoreTarget(resume.versions.find((v) => v.id === id) ?? null)} />
        ) : (
          <StateBlock kind="empty" title={t("resume.versions.empty.title")} description={t("resume.versions.empty.description")} />
        )}

        {/* 比较区 */}
        <aside className="card-soft h-fit p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <GitCompare className="size-4 text-cobalt" aria-hidden /> {t("resume.versions.compare.title")}
          </div>
          {selected.length < 2 ? (
            <p className="text-sm text-muted-foreground">{t("resume.versions.compare.selectHint", { count: selected.length })}</p>
          ) : compareA && compareB ? (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {t("resume.versions.compare.comparing")} <code className="font-mono text-foreground">{compareA.id}</code> ↔ <code className="font-mono text-foreground">{compareB.id}</code>
              </p>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-foreground">{compareB.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("resume.versions.compare.earlier", { message: compareA.message })}</p>
                <p className="mt-2 text-xs text-muted-foreground">{t("resume.versions.compare.changedSections", { sections: Array.from(new Set([...compareA.affectedSections, ...compareB.affectedSections])).join(t("common.listSeparator")) || t("resume.versions.compare.none") })}</p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {restoreTarget ? <RestoreModal version={restoreTarget} onClose={() => setRestoreTarget(null)} /> : null}
    </div>
  )
}

function RestoreModal({ version, onClose }: { version: ResumeVersion; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-foreground/40" aria-label={t("common.actions.close")} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="restore-title" className="relative z-10 w-full max-w-md card-frame p-6">
        <div className="flex items-start justify-between">
          <h2 id="restore-title" className="font-serif text-xl font-bold text-foreground">{t("resume.restore.title")}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label={t("common.actions.close")}><X className="size-5" /></button>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("resume.restore.targetPrefix")}<code className="font-mono text-foreground">{version.id}</code>{t("resume.restore.targetSuffix", { message: version.message })}
        </p>
        <ul className="mt-3 space-y-1.5 rounded-lg bg-secondary p-3 text-xs leading-5 text-secondary-foreground">
          <li>· {t("resume.restore.bullet1")}</li>
          <li>· {t("resume.restore.bullet2")}</li>
          <li>· {t("resume.restore.bullet3")}</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">{t("common.actions.cancel")}</button>
          <button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{t("resume.restore.confirm")}</button>
        </div>
      </div>
    </div>
  )
}
