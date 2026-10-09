// SCR-005 新增 JD。支持两种自然语言创建方式：
//  1) 粘贴岗位文本 → AI 整理成结构化 JD
//  2) 上传截图 → AI 识别 → 结构化
// AI 结果为草案，用户核对/编辑后再创建。
//
// CreateJdModal 是状态容器（输入 / 整理中 / 草案 / 失败），CreateJdDialogView 是
// 纯呈现层：Storybook 用它逐态确认，阶段二接真实端点时只改容器，不动视觉。

import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import type { JobDescription, ProposedJd } from "@/lib/types"
import { parseJdFromText, parseJdFromImage, createJd } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { AlertTriangle, ClipboardPaste, ImageUp, Loader2, Sparkles, X } from "lucide-react"

type Mode = "text" | "image"

/** 解析失败的可映射错误码；与阶段二后端契约（issue fb67d）一致。 */
export type JdParseErrorCode =
  | "MODEL_NOT_CONFIGURED"
  | "MODEL_NO_VISION"
  | "VALIDATION_FAILED"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_REJECTED"
  | "MODEL_OUTPUT_INVALID"
  | "NETWORK_ERROR"

const PARSE_ERROR_KEYS: Record<JdParseErrorCode, string> = {
  MODEL_NOT_CONFIGURED: "jd.create.errors.MODEL_NOT_CONFIGURED",
  MODEL_NO_VISION: "jd.create.errors.MODEL_NO_VISION",
  VALIDATION_FAILED: "jd.create.errors.VALIDATION_FAILED",
  UPSTREAM_TIMEOUT: "jd.create.errors.UPSTREAM_TIMEOUT",
  UPSTREAM_REJECTED: "jd.create.errors.UPSTREAM_REJECTED",
  MODEL_OUTPUT_INVALID: "jd.create.errors.MODEL_OUTPUT_INVALID",
  NETWORK_ERROR: "jd.create.errors.NETWORK_ERROR",
}

/** 把后端机器错误码收敛成可映射的错误态；未知一律按网络错误，绝不透出 message 原文。 */
function parseErrorCode(cause: unknown): JdParseErrorCode {
  if (cause instanceof ApiRequestError && cause.code in PARSE_ERROR_KEYS) return cause.code as JdParseErrorCode
  return "NETWORK_ERROR"
}

export interface CreateJdDialogViewProps {
  mode: Mode
  onModeChange: (mode: Mode) => void
  text: string
  onTextChange: (text: string) => void
  parsing: boolean
  onTextParse: () => void
  onImageParse: () => void
  draft: ProposedJd | null
  onDraftChange: (draft: ProposedJd) => void
  onResetDraft: () => void
  error: JdParseErrorCode | null
  onRetry: () => void
  onOpenSettings?: () => void
  onClose: () => void
  onCreate: () => void
  creating: boolean
  imageName: string | null
  imagePreview: string | null
  onPickImage: (file: File) => void
}

export function CreateJdDialogView({
  mode,
  onModeChange,
  text,
  onTextChange,
  parsing,
  onTextParse,
  onImageParse,
  draft,
  onDraftChange,
  onResetDraft,
  error,
  onRetry,
  onOpenSettings,
  onClose,
  onCreate,
  creating,
  imageName,
  imagePreview,
  onPickImage,
}: CreateJdDialogViewProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t("jd.create.title")}>
      <button className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]" aria-label={t("common.actions.close")} onClick={onClose} />
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
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" aria-label={t("common.actions.close")}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 输入方式切换 */}
          <div className="mb-4 inline-flex rounded-lg border border-border bg-background p-1">
            <TabButton active={mode === "text"} onClick={() => onModeChange("text")} icon={<ClipboardPaste className="size-4" aria-hidden />} label={t("jd.create.tabText")} />
            <TabButton active={mode === "image"} onClick={() => onModeChange("image")} icon={<ImageUp className="size-4" aria-hidden />} label={t("jd.create.tabImage")} />
          </div>

          {mode === "text" ? (
            <div className="space-y-2">
              <textarea
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                rows={7}
                placeholder={t("jd.create.textPlaceholder")}
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <button
                onClick={onTextParse}
                disabled={!text.trim() || parsing}
                aria-busy={parsing || undefined}
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
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onPickImage(file)
                }}
              />
              {imagePreview ? (
                <img src={imagePreview || "/placeholder.svg"} alt={t("jd.create.imageAlt")} className="max-h-48 w-full rounded-lg border border-border object-contain" />
              ) : null}
              <button
                onClick={onImageParse}
                disabled={!imageName || parsing}
                aria-busy={parsing || undefined}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                {parsing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                {parsing ? t("jd.create.recognizing") : t("jd.create.parseImage")}
              </button>
            </div>
          )}

          {/* 整理失败：按机器码映射文案，绝不透出后端 message 原文 */}
          {error ? (
            <div role="alert" className="mt-4 rounded-lg border border-coral/40 bg-coral/5 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-coral">
                <AlertTriangle className="size-4" aria-hidden /> {t("jd.create.errorTitle")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t(PARSE_ERROR_KEYS[error])}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {error === "MODEL_NOT_CONFIGURED" || error === "MODEL_NO_VISION" ? (
                  onOpenSettings ? (
                    <button onClick={onOpenSettings} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                      {t(error === "MODEL_NO_VISION" ? "jd.create.openVisionSettings" : "jd.create.openSettings")}
                    </button>
                  ) : null
                ) : (
                  <button onClick={onRetry} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
                    {t("jd.create.retry")}
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {/* AI 草案 */}
          {draft ? (
            <div className="mt-5 rounded-xl border-[1.5px] border-foreground/15 bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{t("jd.create.draftTitle")}</span>
                <span className="text-[11px] text-muted-foreground">{t("jd.create.confidence", { percent: Math.round(draft.parseConfidence * 100) })}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("jd.create.fieldRole")} value={draft.role} onChange={(v) => onDraftChange({ ...draft, role: v })} />
                <Field label={t("jd.create.fieldCompany")} value={draft.company ?? ""} onChange={(v) => onDraftChange({ ...draft, company: v })} />
              </div>
              <Field className="mt-3" label={t("jd.create.fieldTags")} value={draft.tags.join(", ")} onChange={(v) => onDraftChange({ ...draft, tags: v.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) })} />
              <Field className="mt-3" label={t("jd.create.fieldSourceUrl")} value={draft.sourceUrl ?? ""} onChange={(v) => onDraftChange({ ...draft, sourceUrl: v || undefined })} />
              <label className="mt-3 block">
                <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("jd.create.fieldBody")}</span>
                <textarea
                  value={draft.body}
                  onChange={(e) => onDraftChange({ ...draft, body: e.target.value })}
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
            <button onClick={onResetDraft} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">{t("jd.create.reset")}</button>
            <button
              onClick={onCreate}
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

export function CreateJdModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (jd: JobDescription) => void
}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>("text")
  const [text, setText] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageName, setImageName] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [draft, setDraft] = useState<ProposedJd | null>(null)
  const [error, setError] = useState<JdParseErrorCode | null>(null)
  const [creating, setCreating] = useState(false)

  if (!open) return null

  function reset() {
    setMode("text")
    setText("")
    setImageFile(null)
    setImageName(null)
    setImagePreview(null)
    setDraft(null)
    setParsing(false)
    setError(null)
    setCreating(false)
  }

  function close() {
    reset()
    onClose()
  }

  async function runParse(task: () => Promise<ProposedJd>) {
    if (parsing) return
    setParsing(true)
    setError(null)
    try {
      setDraft(await task())
    } catch (cause) {
      setError(parseErrorCode(cause))
    } finally {
      setParsing(false)
    }
  }

  function runTextParse() {
    if (!text.trim()) return
    void runParse(() => parseJdFromText(text))
  }

  function runImageParse() {
    if (!imageFile) return
    void runParse(() =>
      parseJdFromImage({ image: imageFile, filename: imageFile.name, contentType: imageFile.type }),
    )
  }

  function pickImage(file: File) {
    setImageFile(file)
    setImageName(file.name)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(typeof reader.result === "string" ? reader.result : null)
    reader.readAsDataURL(file)
  }

  async function confirmCreate() {
    if (!draft || creating) return
    setCreating(true)
    try {
      const jd = await createJd(draft)
      onCreated(jd)
      close()
    } finally {
      setCreating(false)
    }
  }

  return (
    <CreateJdDialogView
      mode={mode}
      onModeChange={setMode}
      text={text}
      onTextChange={setText}
      parsing={parsing}
      onTextParse={runTextParse}
      onImageParse={runImageParse}
      draft={draft}
      onDraftChange={setDraft}
      onResetDraft={() => setDraft(null)}
      error={error}
      onRetry={mode === "text" ? runTextParse : runImageParse}
      onOpenSettings={() => {
        close()
        navigate("/settings")
      }}
      onClose={close}
      onCreate={confirmCreate}
      creating={creating}
      imageName={imageName}
      imagePreview={imagePreview}
      onPickImage={pickImage}
    />
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
