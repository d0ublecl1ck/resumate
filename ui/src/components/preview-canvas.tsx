// DES-013 预览画布。草稿预览必须标明「草稿预览」；正式版本预览与 PDF
// 使用相同内容版本、模板版本与导出配置。画布不是唯一读取方式：提供文本结构。

import { useTranslation } from "react-i18next"
import type { ResumeDocument } from "@/lib/types"
import { cn } from "@/lib/utils"

export function PreviewCanvas({
  document,
  mode,
  versionId,
  templateName,
  className,
}: {
  document: ResumeDocument
  mode: "draft" | "committed"
  versionId: string
  templateName: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            mode === "draft" ? "border-coral/40 bg-coral/5 text-coral" : "border-foreground/25 bg-secondary text-foreground",
          )}
        >
          {mode === "draft" ? t("resume.preview.draft") : t("resume.preview.committed")}
        </span>
        <span className="text-xs text-muted-foreground">
          {templateName} · <code className="font-mono">{versionId}</code>
        </span>
      </div>

      <div className="flex-1 overflow-auto bg-muted/40 p-4">
        <article className="mx-auto max-w-[46rem] rounded-md bg-card p-8 shadow-sm ring-1 ring-border" aria-label={t("resume.preview.contentAria")}>
          <header className="border-b border-border pb-4">
            <h2 className="font-serif text-2xl font-bold text-foreground">{document.basics.fullName}</h2>
            <p className="mt-1 text-sm text-cobalt">{document.basics.headline}</p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {document.basics.email ? <span>{document.basics.email}</span> : null}
              {document.basics.phone ? <span>{document.basics.phone}</span> : null}
              {document.basics.location ? <span>{document.basics.location}</span> : null}
              {document.basics.links.map((l) => (
                <span key={l.url}>{l.label}</span>
              ))}
            </p>
          </header>

          {document.sections.map((sec) => (
            <section key={sec.id} className="mt-5">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-foreground">{sec.title}</h3>
              {sec.text ? <p className="text-sm leading-6 text-foreground/90">{sec.text}</p> : null}
              {sec.entries.map((e) => (
                <div key={e.id} className="mb-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{e.title}</p>
                    {e.period ? <span className="text-xs text-muted-foreground">{e.period}</span> : null}
                  </div>
                  {e.subtitle ? <p className="text-xs text-muted-foreground">{e.subtitle}</p> : null}
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm leading-6 text-foreground/90">
                    {e.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}
