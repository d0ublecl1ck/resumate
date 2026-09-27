// SCR-003 简历编辑工作台。三栏：结构化编辑 / 对话+Run / 预览。
// 顶部资源上下文条锁定 Resume、JD、模式、版本、保存状态（DES-001）。
// 窄屏按「编辑 → 对话 → 预览」切换（DES-003 布局契约）。

import { Link } from "react-router-dom"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { AgentRun, JobDescription, Resume, ResumeDocument } from "@/lib/types"
import { StructuredEditor } from "@/components/structured-editor"
import { RunPanel } from "@/components/run-panel"
import { PreviewCanvas } from "@/components/preview-canvas"
import { SaveStateBadge } from "@/components/kit/badges"
import { cn } from "@/lib/utils"
import { ArrowLeft, Download, History, Link2, PanelsTopLeft } from "lucide-react"

type Column = "edit" | "chat" | "preview"

export function ResumeEditor({
  resume,
  run,
  templateName,
  boundJds,
  initialColumn = "edit",
}: {
  resume: Resume
  run?: AgentRun
  templateName: string
  boundJds: JobDescription[]
  initialColumn?: Column
}) {
  const { t } = useTranslation()
  const [doc, setDoc] = useState<ResumeDocument>(resume.document)
  const [saveState, setSaveState] = useState(resume.saveState)
  const [mobileCol, setMobileCol] = useState<Column>(initialColumn)
  const dirty = saveState === "local_unsynced" || saveState === "uncommitted"

  function onDocChange(next: ResumeDocument) {
    setDoc(next)
    // C-05：有效输入立即标记本地未送达，重置静默计时（此处演示为状态切换）。
    setSaveState("local_unsynced")
  }

  function flush() {
    setSaveState("saving")
    setTimeout(() => setSaveState("committed"), 500)
  }

  return (
    <div className="flex h-[calc(100vh-1rem)] flex-col">
      {/* 资源上下文条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/resumes" className="rounded-md border border-border p-2 text-muted-foreground hover:bg-secondary" aria-label={t("resume.editor.backToLibrary")}>
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-xl font-bold text-foreground">{resume.title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{t("resume.editor.target", { role: resume.targetRole })}</span>
              <span className="inline-flex items-center gap-1">
                <Link2 className="size-3" aria-hidden />
                {boundJds.length ? boundJds.map((j) => j.role).join(t("common.listSeparator")) : t("resume.editor.noBoundJd")}
              </span>
              <span>{t("resume.editor.baseline")} <code className="font-mono text-foreground">{resume.currentVersionId}</code></span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveStateBadge state={saveState} />
          <button
            onClick={flush}
            disabled={!dirty}
            className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("resume.editor.flush")}
          </button>
          <Link to={`/resumes/${resume.id}/versions`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <History className="size-4" aria-hidden /> {t("resume.editor.versions")}
          </Link>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <Download className="size-4" aria-hidden /> {t("resume.editor.export")}
          </button>
        </div>
      </div>

      {/* 窄屏列切换 */}
      <div className="mt-3 flex gap-1 rounded-lg border border-border bg-card p-1 lg:hidden">
        {([
          { key: "edit", labelKey: "resume.editor.column.edit" },
          { key: "chat", labelKey: "resume.editor.column.chat" },
          { key: "preview", labelKey: "resume.editor.column.preview" },
        ] as { key: Column; labelKey: string }[]).map((c) => (
          <button
            key={c.key}
            onClick={() => setMobileCol(c.key)}
            aria-pressed={mobileCol === c.key}
            className={cn("flex-1 rounded-md py-1.5 text-sm font-medium transition-colors", mobileCol === c.key ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            {t(c.labelKey)}
          </button>
        ))}
      </div>

      {/* 三栏 */}
      <div className="mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className={cn("min-h-0 overflow-auto rounded-lg", mobileCol === "edit" ? "block" : "hidden", "lg:block")} aria-label={t("resume.editor.structuredEditing")}>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <PanelsTopLeft className="size-3.5" aria-hidden /> {t("resume.editor.structuredEditing")}
          </div>
          <StructuredEditor document={doc} onChange={onDocChange} />
        </section>

        <section className={cn("min-h-0 card-soft", mobileCol === "chat" ? "block" : "hidden", "lg:block")} aria-label={t("resume.editor.chatAndRun")}>
          <RunPanel run={run} mode={resume.versions[0]?.executionMode ?? "approval"} />
        </section>

        <section className={cn("min-h-0 card-soft overflow-hidden", mobileCol === "preview" ? "block" : "hidden", "lg:block")} aria-label={t("resume.editor.preview")}>
          <PreviewCanvas document={doc} mode={dirty ? "draft" : "committed"} versionId={resume.currentVersionId} templateName={templateName} />
        </section>
      </div>
    </div>
  )
}
