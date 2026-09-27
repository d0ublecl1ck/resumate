// SCR-005 新增 JD。支持两种自然语言创建方式：
//  1) 粘贴岗位文本 → AI 整理成结构化 JD
//  2) 上传截图 → AI 识别 → 结构化
// AI 结果为草案，用户核对/编辑后再创建。

import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { JobDescription, ProposedJd } from "@/lib/types"
import { parseJdFromText, parseJdFromImage, createJd } from "@/lib/api"
import { cn } from "@/lib/utils"
import { ClipboardPaste, ImageUp, Loader2, Sparkles, X } from "lucide-react"

type Mode = "text" | "image"

export function CreateJdModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (jd: JobDescription) => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>("text")
  const [text, setText] = useState("")
  const [imageName, setImageName] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [draft, setDraft] = useState<ProposedJd | null>(null)
  const [creating, setCreating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  function reset() {
    setMode("text")
    setText("")
    setImageName(null)
    setImagePreview(null)
    setDraft(null)
    setParsing(false)
    setCreating(false)
  }

  function close() {
    reset()
    onClose()
  }

  async function runTextParse() {
    if (!text.trim() || parsing) return
    setParsing(true)
    const result = await parseJdFromText(text)
    setDraft(result)
    setParsing(false)
  }

  function pickImage(file: File) {
    setImageName(file.name)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(typeof reader.result === "string" ? reader.result : null)
    reader.readAsDataURL(file)
  }

  async function runImageParse() {
    if (!imageName || parsing) return
    setParsing(true)
    const result = await parseJdFromImage(imageName)
    setDraft(result)
    setParsing(false)
  }

  async function confirmCreate() {
    if (!draft || creating) return
    setCreating(true)
    const jd = await createJd(draft)
    setCreating(false)
    onCreated(jd)
    close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t("jd.create.title")}>
      <button className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]" aria-label={t("common.actions.close")} onClick={close} />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border-[1.5px] border-foreground/15 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-cobalt/15 text-cobalt">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("jd.create.title")}</p>
              <p className="text-xs text-muted-foreground">{t("jd.create.subtitle")}</p>
            </div>
          </div>
          <button onClick={close} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" aria-label={t("common.actions.close")}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 输入方式切换 */}
          <div className="mb-4 inline-flex rounded-lg border border-border bg-background p-1">
            <TabButton active={mode === "text"} onClick={() => setMode("text")} icon={<ClipboardPaste className="size-4" aria-hidden />} label={t("jd.create.tabText")} />
            <TabButton active={mode === "image"} onClick={() => setMode("image")} icon={<ImageUp className="size-4" aria-hidden />} label={t("jd.create.tabImage")} />
          </div>

          {mode === "text" ? (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                placeholder={t("jd.create.textPlaceholder")}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <button
                onClick={runTextParse}
                disabled={!text.trim() || parsing}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {parsing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                {parsing ? t("jd.create.parsing") : t("jd.create.parseText")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-cobalt/40 hover:bg-secondary/60"
              >
                <ImageUp className="size-6 text-cobalt" aria-hidden />
                {imageName ? <span className="font-medium text-foreground">{imageName}</span> : t("jd.create.imagePlaceholder")}
                <span className="text-xs">{t("jd.create.imageSupport")}</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) pickImage(file)
                }}
              />
              {imagePreview ? (
                <img src={imagePreview || "/placeholder.svg"} alt={t("jd.create.imageAlt")} className="max-h-48 w-full rounded-lg border border-border object-contain" />
              ) : null}
              <button
                onClick={runImageParse}
                disabled={!imageName || parsing}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {parsing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                {parsing ? t("jd.create.recognizing") : t("jd.create.parseImage")}
              </button>
            </div>
          )}

          {/* AI 草案 */}
          {draft ? (
            <div className="mt-5 rounded-xl border-[1.5px] border-foreground/15 bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{t("jd.create.draftTitle")}</span>
                <span className="text-[11px] text-muted-foreground">{t("jd.create.confidence", { percent: Math.round(draft.parseConfidence * 100) })}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("jd.create.fieldRole")} value={draft.role} onChange={(v) => setDraft({ ...draft, role: v })} />
                <Field label={t("jd.create.fieldCompany")} value={draft.company ?? ""} onChange={(v) => setDraft({ ...draft, company: v })} />
              </div>
              <Field className="mt-3" label={t("jd.create.fieldTags")} value={draft.tags.join(", ")} onChange={(v) => setDraft({ ...draft, tags: v.split(/[,，]/).map((t) => t.trim()).filter(Boolean) })} />
              <Field className="mt-3" label={t("jd.create.fieldSourceUrl")} value={draft.sourceUrl ?? ""} onChange={(v) => setDraft({ ...draft, sourceUrl: v || undefined })} />
              <label className="mt-3 block">
                <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("jd.create.fieldBody")}</span>
                <textarea
                  value={draft.body}
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  rows={5}
                  className="w-full resize-none rounded-md border border-input bg-card px-2.5 py-1.5 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
              </label>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{draft.note}</p>
            </div>
          ) : null}
        </div>

        {draft ? (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button onClick={() => setDraft(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">{t("jd.create.reset")}</button>
            <button
              onClick={confirmCreate}
              disabled={creating || !draft.role.trim()}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {creating ? t("jd.create.creating") : t("jd.create.confirm")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function Field({ label, value, onChange, className }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
    </label>
  )
}
