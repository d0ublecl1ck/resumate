// SCR-101 创建简历 Modal。两条链路：从现有简历复制 / 完全新开空稿。
// 复制是两步：先在这里选「从现有简历复制」，点创建后进入大弹层 ResumePickerDialog 选题再复制。
// 对话创建与 Profile 预填充已移出本弹窗，后续另开入口。

import { useNavigate } from "react-router-dom"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { createResume, duplicateResume } from "@/lib/api"
import { resumeCreateErrorMessage } from "@/lib/resume-create"
import { ResumePickerDialog } from "@/components/resume-picker-dialog"
import type { Resume, ResumeTemplate } from "@/lib/types"
import { Copy, Plus, X } from "lucide-react"

type Method = "copy" | "blank"

export function CreateResumeModal({
  open,
  onClose,
  resumes,
  templates,
}: {
  open: boolean
  onClose: () => void
  resumes: Resume[]
  templates: ResumeTemplate[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<Method>("copy")
  const [picking, setPicking] = useState(false)
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const copySources = resumes.filter((resume) => resume.lifecycle === "active")
  const usableTemplates = templates.filter((template) => template.status === "published")
  const canCopy = copySources.length > 0
  const canBlank = usableTemplates.length > 0

  // 链路可用性随数据变化：选中的链路不可用时落到另一条，避免出现提交必失败的组合。
  const effectiveMethod: Method = method === "copy" && !canCopy ? "blank" : method === "blank" && !canBlank ? "copy" : method
  const blocked = effectiveMethod === "copy" ? !canCopy : !canBlank

  const methods: { key: Method; labelKey: string; descKey: string; icon: React.ElementType; available: boolean; reasonId?: string }[] = [
    { key: "copy", labelKey: "resume.create.method.copy.label", descKey: "resume.create.method.copy.desc", icon: Copy, available: canCopy, reasonId: canCopy ? undefined : "create-no-source" },
    { key: "blank", labelKey: "resume.create.method.blank.label", descKey: "resume.create.method.blank.desc", icon: Plus, available: canBlank, reasonId: canBlank ? undefined : "create-no-template" },
  ]

  /** 关闭弹窗时把内部步骤状态一起复位，避免下次打开直接落在选择层。 */
  function close() {
    setPicking(false)
    setSourceId(null)
    setError(null)
    setSubmitting(false)
    onClose()
  }

  async function finish(action: () => Promise<Resume>) {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const created = await action()
      await queryClient.invalidateQueries({ queryKey: ["resumes"] })
      await queryClient.invalidateQueries({ queryKey: ["workbench-summary"] })
      close()
      navigate(`/resumes/${created.id}`)
    } catch (cause) {
      setError(resumeCreateErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  function start() {
    if (submitting || blocked) return
    if (effectiveMethod === "copy") {
      // 复制不在这里直接创建：先进入简历选择层。
      setError(null)
      setPicking(true)
      return
    }
    void finish(() => createResume({ title: t("resume.create.defaultTitle"), templateId: usableTemplates[0].id }))
  }

  if (picking) {
    return (
      <ResumePickerDialog
        resumes={copySources}
        selectedId={sourceId}
        onSelect={setSourceId}
        onCancel={() => {
          setPicking(false)
          setError(null)
        }}
        onConfirm={() => {
          if (sourceId) void finish(() => duplicateResume(sourceId))
        }}
        busy={submitting}
        error={error}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-foreground/40" aria-label={t("common.actions.close")} onClick={close} />
      <div role="dialog" aria-modal="true" aria-labelledby="create-title" className="relative z-10 w-full max-w-lg card-frame max-h-[88vh] overflow-auto p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="create-title" className="font-serif text-2xl font-bold text-foreground">{t("resume.create.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("resume.create.description")}</p>
          </div>
          <button onClick={close} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label={t("common.actions.close")}>
            <X className="size-5" />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-foreground">{t("resume.create.methodLegend")}</legend>
          <div className="grid gap-2">
            {methods.map((item) => {
              const Icon = item.icon
              const active = effectiveMethod === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    setMethod(item.key)
                    setError(null)
                  }}
                  disabled={!item.available || submitting}
                  aria-pressed={active}
                  aria-describedby={item.reasonId}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    active ? "border-cobalt bg-cobalt/5" : "border-border hover:bg-secondary",
                  )}
                >
                  <Icon className={cn("mt-0.5 size-5 shrink-0", active ? "text-cobalt" : "text-muted-foreground")} aria-hidden />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{t(item.labelKey)}</span>
                    <span className="block text-xs text-muted-foreground">{t(item.descKey)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        {!canCopy ? <p id="create-no-source" className="mt-3 text-xs text-muted-foreground">{t("resume.create.noSource")}</p> : null}
        {!canBlank ? <p id="create-no-template" className="mt-3 text-xs text-muted-foreground">{t("resume.create.noTemplate")}</p> : null}

        {error ? <p role="alert" className="mt-4 text-sm text-coral">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={close} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">{t("common.actions.cancel")}</button>
          <button
            onClick={start}
            disabled={blocked || submitting}
            aria-busy={submitting}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? t("resume.create.submitting") : t("common.actions.create")}
          </button>
        </div>
      </div>
    </div>
  )
}
