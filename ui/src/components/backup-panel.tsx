// SCR-012 备份与迁移 + SCR-112 导入预览 Modal。
// 导出走后端真实 JSON/Markdown；导入先上传校验再确认，始终创建新资源并重映射 ID。
// 界面文案统一走 i18n。

import { useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { exportBackup, exportBackupMarkdown, importBackup, previewImport } from "@/lib/api"
import type { BackupPayload, ImportPreview, ImportResult } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AlertTriangle, CheckCircle2, Download, FileJson, FileText, Upload, X } from "lucide-react"

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function BackupPanel() {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [payload, setPayload] = useState<BackupPayload | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState(false)

  const exportJson = useMutation({
    mutationFn: exportBackup,
    onSuccess: (data) => download("resumate-backup.json", JSON.stringify(data, null, 2), "application/json"),
  })
  const exportMarkdown = useMutation({
    mutationFn: exportBackupMarkdown,
    onSuccess: (text) => download("resumate-backup.md", text, "text/markdown"),
  })
  const previewMutation = useMutation({
    mutationFn: (body: BackupPayload) => previewImport(body),
    onSuccess: (data, body) => {
      setPreview(data)
      setPayload(body)
      setResult(null)
    },
  })
  const importMutation = useMutation({
    mutationFn: (body: BackupPayload) => importBackup(body),
    onSuccess: (data) => {
      setResult(data)
      setPreview(null)
    },
  })

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setParseError(false)
    try {
      const parsed = JSON.parse(await file.text()) as BackupPayload
      previewMutation.mutate(parsed)
    } catch {
      setParseError(true)
    }
  }

  const busy = exportJson.isPending || exportMarkdown.isPending

  return (
    <div className="space-y-6">
      <section className="card-soft p-5">
        <h2 className="text-sm font-bold text-foreground">{t("settings.backup.exportTitle")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("settings.backup.exportHint")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportJson.mutate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <FileJson className="size-4" aria-hidden /> {t("settings.backup.exportJson")}
          </button>
          <button
            onClick={() => exportMarkdown.mutate()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
          >
            <FileText className="size-4" aria-hidden /> {t("settings.backup.exportMarkdown")}
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <Download className="size-4" aria-hidden /> {t("settings.backup.downloadEvidence")}
          </button>
          {busy ? <span className="text-xs text-muted-foreground">{t("settings.backup.exporting")}</span> : null}
          {exportJson.isError || exportMarkdown.isError ? <span className="text-xs text-coral">{t("settings.backup.exportFailed")}</span> : null}
        </div>
      </section>

      <section className="card-soft p-5">
        <h2 className="text-sm font-bold text-foreground">{t("settings.backup.importTitle")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("settings.backup.importHint")}</p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} aria-label={t("settings.backup.chooseFile")} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={previewMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
          >
            <Upload className="size-4" aria-hidden /> {t("settings.backup.chooseFile")}
          </button>
          {previewMutation.isPending ? <span className="text-xs text-muted-foreground">{t("settings.backup.reading")}</span> : null}
          {parseError ? <span className="text-xs text-coral">{t("settings.backup.invalidFile")}</span> : null}
          {previewMutation.isError ? <span className="text-xs text-coral">{t("settings.backup.importFailed")}</span> : null}
        </div>
        {result ? (
          <p className="mt-3 inline-flex items-center gap-1 text-xs text-cobalt">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {t("settings.importModal.imported", { resumes: result.imported.resumes, jds: result.imported.jds })}
          </p>
        ) : null}
      </section>

      {preview && payload ? (
        <ImportModal
          preview={preview}
          pending={importMutation.isPending}
          failed={importMutation.isError}
          onClose={() => setPreview(null)}
          onConfirm={() => importMutation.mutate(payload)}
        />
      ) : null}
    </div>
  )
}

function ImportModal({
  preview,
  pending,
  failed,
  onClose,
  onConfirm,
}: {
  preview: ImportPreview
  pending: boolean
  failed: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const counts = preview.manifest.resourceCounts
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-foreground/40" aria-label={t("common.actions.close")} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="relative z-10 w-full max-w-xl card-frame max-h-[88vh] overflow-auto p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="import-title" className="font-serif text-xl font-bold text-foreground">{t("settings.importModal.title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.importModal.meta", {
                format: preview.manifest.formatVersion,
                resumes: counts.resumes,
                versions: counts.versions,
                profiles: counts.profiles,
                facts: counts.facts,
                jds: counts.jds,
              })}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label={t("common.actions.close")}><X className="size-5" /></button>
        </div>

        {preview.status === "has_issues" ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-coral/40 bg-coral/5 p-3 text-xs leading-5 text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-coral" aria-hidden />
            <div>
              <p className="font-medium text-coral">{t("settings.importModal.hasIssues")}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                {preview.missingReferences.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cobalt">{t("settings.importModal.newResources")}</p>
            <ul className="space-y-1.5">
              {preview.newResources.map((resource) => (
                <li key={resource.type + resource.title} className="rounded-md border border-cobalt/30 bg-cobalt/5 px-2.5 py-1.5 text-xs text-foreground">
                  <span className="text-muted-foreground">{resource.type}</span> · {resource.title}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("settings.importModal.existingResources")}</p>
            <p className="rounded-md border border-border bg-muted px-2.5 py-1.5 text-xs leading-5 text-muted-foreground">{t("settings.importModal.existingHint")}</p>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("settings.importModal.bindingRestores")}</p>
          <ul className="space-y-1.5">
            {preview.bindingRestores.map((binding) => (
              <li key={binding.jd} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs">
                <span className="text-foreground">{binding.jd} → {binding.resume}</span>
                <span className={cn("rounded px-1.5 py-0.5 font-medium", binding.status === "mapped" ? "bg-cobalt/10 text-cobalt" : "bg-gold/25 text-foreground")}>
                  {binding.status === "mapped" ? t("settings.importModal.mapped") : t("settings.importModal.unmapped")}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          {failed ? <span className="text-xs text-coral">{t("settings.importModal.importFailed")}</span> : null}
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">{t("common.actions.cancel")}</button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? t("settings.importModal.importing") : t("settings.importModal.confirm")}
          </button>
        </div>
      </div>
    </div>
  )
}
