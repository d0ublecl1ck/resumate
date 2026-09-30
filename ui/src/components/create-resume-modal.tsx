// SCR-101 创建简历 Modal。三种创建方式：对话创建 / 表单创建 / Profile 生成。
// C-01：approval 模式下 Agent 创建需二次确认；表单显式提交视为授权。
// 表单创建走真实 POST /resumes；对话 / Profile 走 Agent 流程，后端能力未就绪时明确提示未接入。

import { useNavigate } from "react-router-dom"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import i18n from "@/i18n"
import { cn } from "@/lib/utils"
import { createResume } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import type { JobDescription, ResumeTemplate } from "@/lib/types"
import { MessageSquare, PenLine, Sparkles, X } from "lucide-react"

type Method = "chat" | "form" | "profile"

const METHODS: { key: Method; labelKey: string; descKey: string; icon: React.ElementType }[] = [
  { key: "form", labelKey: "resume.create.method.form.label", descKey: "resume.create.method.form.desc", icon: PenLine },
  { key: "chat", labelKey: "resume.create.method.chat.label", descKey: "resume.create.method.chat.desc", icon: MessageSquare },
  { key: "profile", labelKey: "resume.create.method.profile.label", descKey: "resume.create.method.profile.desc", icon: Sparkles },
]

/** 机器错误码 → i18n 文案；禁止把后端 message 直出为界面文案（C-06）。 */
function createErrorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "VALIDATION_FAILED") return i18n.t("resume.create.errors.validation")
    if (cause.code === "FORBIDDEN" || cause.code === "UNAUTHENTICATED") return i18n.t("resume.create.errors.permission")
    if (cause.code === "NETWORK_ERROR") return i18n.t("resume.create.errors.network")
  }
  return i18n.t("resume.create.errors.generic")
}

export function CreateResumeModal({
  open,
  onClose,
  templates,
  jds,
}: {
  open: boolean
  onClose: () => void
  templates: ResumeTemplate[]
  jds: JobDescription[]
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<Method>("form")
  const [title, setTitle] = useState("")
  const [role, setRole] = useState("")
  const [templateId, setTemplateId] = useState(templates.find((t) => t.status === "published")?.id ?? "")
  const [jdId, setJdId] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!open) return null

  const usableTemplates = templates.filter((t) => t.status === "published")
  const needsConfirm = method === "chat" || method === "profile"
  const methodMeta = METHODS.find((m) => m.key === method)
  const selectedTemplate = usableTemplates.find((tpl) => tpl.id === templateId)

  async function submit() {
    if (submitting) return
    setError(null)
    setNotice(null)

    // 对话 / Profile 走 Agent 创建，后端尚无对应端点：明确告知未接入，不伪造成功跳转。
    if (needsConfirm) {
      setNotice(t("resume.create.agentNotAvailable"))
      return
    }

    setSubmitting(true)
    try {
      const created = await createResume({ title, templateId, targetRole: role })
      await queryClient.invalidateQueries({ queryKey: ["resumes"] })
      await queryClient.invalidateQueries({ queryKey: ["workbench-summary"] })
      onClose()
      navigate(`/resumes/${created.id}`)
    } catch (cause) {
      setError(createErrorMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-foreground/40" aria-label={t("common.actions.close")} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="create-title" className="relative z-10 w-full max-w-lg card-frame max-h-[88vh] overflow-auto p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="create-title" className="font-serif text-2xl font-bold text-foreground">{t("resume.create.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("resume.create.description")}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label={t("common.actions.close")}>
            <X className="size-5" />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-foreground">{t("resume.create.methodLegend")}</legend>
          <div className="grid gap-2">
            {METHODS.map((m) => {
              const Icon = m.icon
              const active = method === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => {
                    setMethod(m.key)
                    setError(null)
                    setNotice(null)
                  }}
                  aria-pressed={active}
                  className={cn("flex items-start gap-3 rounded-lg border p-3 text-left transition-colors", active ? "border-cobalt bg-cobalt/5" : "border-border hover:bg-secondary")}
                >
                  <Icon className={cn("mt-0.5 size-5 shrink-0", active ? "text-cobalt" : "text-muted-foreground")} aria-hidden />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{t(m.labelKey)}</span>
                    <span className="block text-xs text-muted-foreground">{t(m.descKey)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-4">
          <Field label={t("resume.create.fields.title")}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("resume.create.placeholders.title")} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
          </Field>
          <Field label={t("resume.create.fields.role")}>
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t("resume.create.placeholders.role")} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
          </Field>
          <Field label={t("resume.create.fields.template")}>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30">
              {usableTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name} · {t("resume.create.revision", { revision: tpl.revision })}</option>
              ))}
            </select>
          </Field>
          {method !== "form" ? (
            <Field label={t("resume.create.fields.jdOptional")}>
              <select value={jdId} onChange={(e) => setJdId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30">
                <option value="">{t("resume.create.noJd")}</option>
                {jds.map((j) => (
                  <option key={j.id} value={j.id}>{j.role}{j.company ? ` · ${j.company}` : ""} · {t("resume.create.revision", { revision: j.revision })}</option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>

        {/* 创建摘要（DES-015 影响摘要） */}
        <div className="mt-5 rounded-lg bg-secondary p-3 text-xs leading-5 text-secondary-foreground">
          <p className="font-medium text-foreground">{t("resume.create.summary.title")}</p>
          <p className="mt-1">
            {t("resume.create.summary.line", {
              method: t(methodMeta?.labelKey ?? ""),
              title: title || t("resume.create.notFilled"),
              role: role || t("resume.create.notFilled"),
              template: selectedTemplate?.name ?? "—",
            })}
          </p>
          {needsConfirm ? <p className="mt-1 text-coral">{t("resume.create.approvalNotice")}</p> : <p className="mt-1">{t("resume.create.formNotice")}</p>}
        </div>

        {error ? <p role="alert" className="mt-4 text-sm text-coral">{error}</p> : null}
        {notice ? <p role="status" className="mt-4 text-sm text-coral">{notice}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">{t("common.actions.cancel")}</button>
          <button
            onClick={submit}
            disabled={!title || !role || submitting}
            aria-busy={method === "form" && submitting}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {method === "form" && submitting ? t("resume.create.submitting") : needsConfirm ? t("resume.create.previewSummary") : t("common.actions.create")}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}
