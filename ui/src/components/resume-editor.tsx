// SCR-003 简历编辑工作台。三栏：结构化编辑 / 对话+Run / 预览。
// 顶部资源上下文条锁定 Resume、JD、模式、版本、保存状态（DES-001）。
// 窄屏按「编辑 → 对话 → 预览」切换（DES-003 布局契约）。

import { Link } from "react-router-dom"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { getPreferences, saveDraft, updateDocument } from "@/lib/api"
import { DEFAULT_AUTOSAVE_SECONDS, useIdleAutosave } from "@/lib/autosave"
import { documentSaveErrorMessage } from "@/lib/resume-document"
import type { AgentRun, JobDescription, Resume, ResumeDocument } from "@/lib/types"
import { StructuredEditor } from "@/components/structured-editor"
import { RunPanel } from "@/components/run-panel"
import { PreviewCanvas } from "@/components/preview-canvas"
import { SaveStateBadge } from "@/components/kit/badges"
import { cn } from "@/lib/utils"
import { ArrowLeft, Download, History, Link2, PanelsTopLeft } from "lucide-react"

type Column = "edit" | "chat" | "preview"

/** 输入停顿后把草稿同步到服务端缓冲的等待时间（与可配置的静默计时分开）。 */
const DRAFT_SYNC_DELAY_MS = 1500

export function ResumeEditor({
  resume,
  run,
  templateName,
  boundJds,
  initialColumn = "edit",
}: {
  resume: Resume
  run?: AgentRun | null
  templateName: string
  boundJds: JobDescription[]
  initialColumn?: Column
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const preferencesQuery = useQuery({ queryKey: ["preferences"], queryFn: getPreferences })
  const autosaveEnabled = preferencesQuery.data?.autosave ?? false
  const autosaveSeconds = preferencesQuery.data?.autosaveIntervalSeconds ?? DEFAULT_AUTOSAVE_SECONDS
  // 重开页面时优先展示服务端草稿缓冲：浏览器异常关闭也不会丢已同步的内容（C-05）。
  const [doc, setDoc] = useState<ResumeDocument>(resume.draft ?? resume.document)
  const [saveState, setSaveState] = useState(resume.saveState)
  const [mobileCol, setMobileCol] = useState<Column>(initialColumn)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  // 未落成正式版本的三态都算「有未保存内容」：本地未送达 / 服务端草稿缓冲 / 未提交。
  const dirty = saveState === "local_unsynced" || saveState === "uncommitted" || saveState === "synced_draft"

  function onDocChange(next: ResumeDocument) {
    setDoc(next)
    // C-05：有效输入立即标记本地未送达，并重置静默计时。
    setSaveState("local_unsynced")
    setRevision((value) => value + 1)
  }

  // C-05：输入停顿后先把草稿同步到服务端缓冲（不建版本），浏览器异常关闭也不会丢。
  useEffect(() => {
    if (!dirty || saving) return
    const timer = window.setTimeout(() => {
      void saveDraft(resume.id, { document: doc, baseVersionId: resume.currentVersionId })
        .then((synced) => setSaveState(synced.saveState))
        // 缓冲失败不打断编辑：静默计时到期仍会走 flush 的报错路径。
        .catch(() => undefined)
    }, DRAFT_SYNC_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [doc, dirty, saving, resume.id, resume.currentVersionId])

  // C-05：静默计时到期自动 flush 成一个 source=manual 版本。
  const secondsLeft = useIdleAutosave({
    active: autosaveEnabled && dirty && !saving,
    seconds: autosaveSeconds,
    revision,
    onIdle: () => void flush(t("resume.editor.autosaveMessage")),
  })

  // C-05：切换简历 / 离开页面立即请求 flush；失败留给服务端已收到的草稿缓冲。
  const leaveRef = useRef({ dirty, doc, resumeId: resume.id, baseVersionId: resume.currentVersionId })
  leaveRef.current = { dirty, doc, resumeId: resume.id, baseVersionId: resume.currentVersionId }
  useEffect(
    () => () => {
      const pending = leaveRef.current
      if (!pending.dirty) return
      void updateDocument(pending.resumeId, { document: pending.doc, baseVersionId: pending.baseVersionId }).catch(() => undefined)
    },
    [],
  )

  // C-05 / C-06：flush 提交整份文档并带基线版本号，服务端用 base_version_id 做乐观锁。
  // 基线过期返回 409 BASE_VERSION_STALE：保留本地草稿、就地报错，刷新后基于最新版本重试。
  async function flush(message = t("resume.editor.manualSaveMessage")) {
    if (saving || !dirty) return
    setSaveError(null)
    setSaving(true)
    setSaveState("saving")
    try {
      const saved = await updateDocument(resume.id, {
        document: doc,
        baseVersionId: resume.currentVersionId,
        message,
      })
      setDoc(saved.document)
      setSaveState(saved.saveState)
      await queryClient.invalidateQueries({ queryKey: ["resume", resume.id] })
      await queryClient.invalidateQueries({ queryKey: ["resumes"] })
    } catch (cause) {
      setSaveState(resume.saveState)
      setSaveError(documentSaveErrorMessage(cause))
    } finally {
      setSaving(false)
    }
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
          {autosaveEnabled && dirty && !saving ? (
            <span className="text-xs text-muted-foreground">{t("resume.editor.autosaveHint", { seconds: secondsLeft })}</span>
          ) : null}
          <button
            onClick={() => void flush()}
            disabled={!dirty || saving}
            aria-busy={saving}
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

      {saveError ? (
        <p role="alert" className="mt-3 rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-sm text-foreground">
          {saveError}
        </p>
      ) : null}

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
          <RunPanel resumeId={resume.id} run={run} mode={resume.versions[0]?.executionMode ?? "approval"} />
        </section>

        <section className={cn("min-h-0 card-soft overflow-hidden", mobileCol === "preview" ? "block" : "hidden", "lg:block")} aria-label={t("resume.editor.preview")}>
          <PreviewCanvas document={doc} mode={dirty ? "draft" : "committed"} versionId={resume.currentVersionId} templateName={templateName} />
        </section>
      </div>
    </div>
  )
}
