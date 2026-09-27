// SCR-009 模板编辑与校验（管理员）。编辑布局/样式/分页/导出配置，
// 运行渲染校验并提交发布。D-03（预览延迟/PDF 容差）未冻结前只作占位。

import { Link } from "react-router-dom"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { ResumeTemplate } from "@/lib/types"
import { PageHeader } from "@/components/kit/toolbar"
import { cn } from "@/lib/utils"
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react"

const CONFIG_FIELDS = [
  { id: "layout", labelKey: "templates.editor.config.layout.label", valueKey: "templates.editor.config.layout.value" },
  { id: "font", labelKey: "templates.editor.config.font.label", valueKey: "templates.editor.config.font.value" },
  { id: "pagination", labelKey: "templates.editor.config.pagination.label", valueKey: "templates.editor.config.pagination.value" },
  { id: "paper", labelKey: "templates.editor.config.paper.label", valueKey: "templates.editor.config.paper.value" },
  { id: "export", labelKey: "templates.editor.config.export.label", valueKey: "templates.editor.config.export.value" },
]

export function TemplateEditor({ template }: { template: ResumeTemplate }) {
  const { t } = useTranslation()
  const [validation, setValidation] = useState<"idle" | "running" | "passed" | "failed">(
    template.validationErrors.length ? "failed" : "idle",
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("templates.editor.title", { name: template.name })}
        description={t("templates.editor.subtitle", { revision: template.revision, references: template.referenceCount })}
        actions={
          <Link to="/admin/templates" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <ArrowLeft className="size-4" aria-hidden /> {t("templates.editor.back")}
          </Link>
        }
      />

      <div className="rounded-lg border border-gold/60 bg-gold/15 p-3 text-xs leading-5 text-foreground">
        {t("templates.editor.notice")}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card-soft space-y-4 p-5">
          <h2 className="text-sm font-bold text-foreground">{t("templates.editor.configTitle")}</h2>
          {CONFIG_FIELDS.map((f) => (
            <div key={f.id} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">{t(f.labelKey)}</p>
              <input defaultValue={t(f.valueKey)} className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm text-foreground outline-none hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/30" />
            </div>
          ))}
        </section>

        <section className="card-soft space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">{t("templates.editor.validationTitle")}</h2>
            <button
              onClick={() => {
                setValidation("running")
                setTimeout(() => setValidation(template.validationErrors.length ? "failed" : "passed"), 800)
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary"
            >
              {t("templates.editor.runValidation")}
            </button>
          </div>

          <div className={cn("rounded-lg border p-3 text-sm", validation === "passed" ? "border-cobalt/40 bg-cobalt/5" : validation === "failed" ? "border-coral/40 bg-coral/5" : "border-border")}>
            {validation === "running" ? (
              <p className="inline-flex items-center gap-2 text-cobalt"><Loader2 className="size-4 animate-spin" aria-hidden /> {t("templates.editor.validation.running")}</p>
            ) : validation === "passed" ? (
              <p className="inline-flex items-center gap-2 text-cobalt"><CheckCircle2 className="size-4" aria-hidden /> {t("templates.editor.validation.passed")}</p>
            ) : validation === "failed" ? (
              <div>
                <p className="mb-1.5 inline-flex items-center gap-2 font-medium text-coral"><AlertTriangle className="size-4" aria-hidden /> {t("templates.editor.validation.failed")}</p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-foreground">
                  {template.validationErrors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">{t("templates.editor.validation.idle")}</p>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{t("templates.editor.samplesTitle")}</p>
            <ul className="mt-1.5 space-y-1 text-xs text-foreground">
              <li>{t("templates.editor.samples.overflow")}</li>
              <li>{t("templates.editor.samples.pages")}</li>
              <li>{t("templates.editor.samples.empty")}</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">{t("templates.editor.saveDraft")}</button>
            <button
              disabled={validation !== "passed"}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("templates.editor.publish")}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("templates.editor.publishNote")}</p>
        </section>
      </div>
    </div>
  )
}
