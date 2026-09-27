// SCR-008 模板库（管理员）。突出「可新选用」与「已有引用仍可用」的区别。
// 已引用模板不能物理删除（BR-D15）；新修订不改变已有 Resume 的模板版本（BR-D16）。

import { Link } from "react-router-dom"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { ResumeTemplate, TemplateStatus } from "@/lib/types"
import { PageHeader } from "@/components/kit/toolbar"
import { cn } from "@/lib/utils"
import { AlertTriangle, Plus } from "lucide-react"

const STATUS_TONE: Record<TemplateStatus, string> = {
  draft: "text-muted-foreground border-border bg-muted",
  validating: "text-cobalt border-cobalt/40 bg-cobalt/5",
  validation_failed: "text-coral border-coral/40 bg-coral/5",
  published: "text-cobalt border-cobalt/40 bg-cobalt/5",
  retired: "text-muted-foreground border-border bg-muted",
}

const FILTERS = [
  { k: "all", labelKey: "templates.library.filter.all" },
  { k: "published", labelKey: "templates.status.published" },
  { k: "draft", labelKey: "templates.status.draft" },
  { k: "retired", labelKey: "templates.status.retired" },
]

export function TemplateLibrary({ templates }: { templates: ResumeTemplate[] }) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<string>("all")
  const items = templates.filter((item) => (filter === "all" ? true : item.status === filter))

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("templates.library.title")}
        description={t("templates.library.description")}
        actions={
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> {t("templates.library.create")}
          </button>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            aria-pressed={filter === f.k}
            className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", filter === f.k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-secondary")}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((tpl) => (
          <li key={tpl.id} className="card-soft p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link to={`/admin/templates/${tpl.id}`} className="font-serif text-lg font-bold text-foreground hover:underline">{tpl.name}</Link>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("templates.library.revisionMeta", { revision: tpl.revision, publisher: tpl.publisher })}</p>
              </div>
              <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[tpl.status])}>{t("templates.status." + tpl.status, { defaultValue: tpl.status })}</span>
            </div>

            <p className="mt-3 text-sm text-foreground">
              {t("templates.library.referencePrefix")}
              <span className="font-semibold">{tpl.referenceCount}</span>
              {t("templates.library.referenceSuffix")}
              {tpl.referenceCount > 0 ? <span className="text-muted-foreground">{t("templates.library.referenceLocked")}</span> : null}
            </p>
            {tpl.status === "retired" && tpl.retiredReason ? <p className="mt-1 text-xs text-muted-foreground">{t("templates.library.retiredReason", { reason: tpl.retiredReason })}</p> : null}
            {tpl.validationErrors.length ? (
              <div className="mt-2 flex items-start gap-1.5 rounded-md border border-coral/40 bg-coral/5 p-2 text-xs text-foreground">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                <span>{t("templates.library.validationIssues", { issues: tpl.validationErrors.length })}</span>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
              <Link to={`/admin/templates/${tpl.id}`} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">{t("templates.library.edit")}</Link>
              {tpl.status === "published" ? (
                <button className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">{t("templates.library.retire")}</button>
              ) : tpl.status === "retired" ? (
                <button className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">{t("templates.library.republish")}</button>
              ) : null}
              <button
                disabled={tpl.referenceCount > 0}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                title={tpl.referenceCount > 0 ? t("templates.library.deleteTooltip") : undefined}
              >
                {t("common.actions.delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
