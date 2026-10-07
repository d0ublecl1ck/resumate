// SCR-004 基本信息直接编辑表单。与「对话编辑」并存：两条路径写同一份主档数据。
// 控件样式沿用事实卡片与结构化编辑器（border-input / focus:ring-ring/30），不引入新视觉规则。
// 失败出口：保存失败不再是未处理的 rejection，而是行内 alert（错误码 + 重试）；
// 邮箱做格式兜底校验，所有输入带长度上限，避免把明显非法的值写进主档。

import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ResumeBasics } from "@/lib/types"
import { userFacingError, type UserFacingError } from "@/lib/api-error-text"
import { Plus, Trash2 } from "lucide-react"

/** 只挡明显非邮箱的输入；真正的可达性由后端兜底，不追求 RFC 完备。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 输入侧长度上限：主档存 JSON，没有数据库兜底，只能在前端收敛。 */
const MAX_LENGTH = {
  fullName: 80,
  headline: 120,
  email: 254,
  phone: 40,
  location: 80,
  linkLabel: 80,
  linkUrl: 500,
} as const

const EMAIL_ERROR_ID = "profile-basics-email-error"

export function ProfileBasicsForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ResumeBasics
  onSave: (next: ResumeBasics) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ResumeBasics>(() => structuredClone(initial))
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<UserFacingError | null>(null)
  // busy 是异步 state，同一 tick 的第二次提交读到仍是 false；用 ref 做同步守卫。
  const submittingRef = useRef(false)

  function set<K extends keyof ResumeBasics>(key: K, value: ResumeBasics[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function updateLink(index: number, patch: Partial<ResumeBasics["links"][number]>) {
    setDraft((prev) => ({ ...prev, links: prev.links.map((l, i) => (i === index ? { ...l, ...patch } : l)) }))
  }

  const nameValid = draft.fullName.trim().length > 0
  const emailText = draft.email.trim()
  const emailValid = emailText.length === 0 || EMAIL_PATTERN.test(emailText)
  const valid = nameValid && emailValid

  async function save() {
    if (submittingRef.current) return
    setSaveError(null)
    if (!valid) return
    submittingRef.current = true
    setBusy(true)
    try {
      await onSave({
        ...draft,
        fullName: draft.fullName.trim(),
        headline: draft.headline.trim(),
        email: emailText,
        phone: draft.phone.trim(),
        location: draft.location.trim(),
        links: draft.links
          .filter((l) => l.url.trim())
          .map((l) => ({ label: l.label.trim() || l.url.trim(), url: l.url.trim() })),
      })
    } catch (cause) {
      setSaveError(userFacingError(cause, t("profile.basics.saveError")))
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput
          label={t("profile.basics.fullName")}
          value={draft.fullName}
          onChange={(v) => set("fullName", v)}
          maxLength={MAX_LENGTH.fullName}
        />
        <LabeledInput
          label={t("profile.basics.headline")}
          value={draft.headline}
          onChange={(v) => set("headline", v)}
          maxLength={MAX_LENGTH.headline}
        />
        <LabeledInput
          label={t("profile.basics.email")}
          value={draft.email}
          onChange={(v) => set("email", v)}
          maxLength={MAX_LENGTH.email}
          invalid={!emailValid}
          errorId={EMAIL_ERROR_ID}
          error={!emailValid ? t("profile.basics.emailInvalid") : undefined}
        />
        <LabeledInput
          label={t("profile.basics.phone")}
          value={draft.phone}
          onChange={(v) => set("phone", v)}
          maxLength={MAX_LENGTH.phone}
        />
        <LabeledInput
          label={t("profile.basics.location")}
          value={draft.location}
          onChange={(v) => set("location", v)}
          maxLength={MAX_LENGTH.location}
        />
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">{t("profile.basics.links")}</legend>
        <ul className="space-y-2">
          {draft.links.map((link, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                value={link.label}
                onChange={(e) => updateLink(index, { label: e.target.value })}
                placeholder={t("profile.basics.linkLabel")}
                aria-label={t("profile.basics.linkNameAria", { index: index + 1 })}
                maxLength={MAX_LENGTH.linkLabel}
                className="w-28 shrink-0 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <input
                value={link.url}
                onChange={(e) => updateLink(index, { url: e.target.value })}
                placeholder="https://"
                aria-label={t("profile.basics.linkUrlAria", { index: index + 1 })}
                maxLength={MAX_LENGTH.linkUrl}
                className="min-w-0 flex-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, links: prev.links.filter((_, i) => i !== index) }))}
                aria-label={t("profile.basics.deleteLinkAria", { index: index + 1 })}
                className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setDraft((prev) => ({ ...prev, links: [...prev.links, { label: "", url: "" }] }))}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cobalt hover:underline"
        >
          <Plus className="size-3.5" aria-hidden /> {t("profile.basics.addLink")}
        </button>
      </fieldset>

      {saveError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
          <span>{saveError.message}</span>
          {saveError.code ? <span className="font-mono">{saveError.code}</span> : null}
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="ml-auto rounded-md border border-coral/40 px-2 py-1 font-medium transition-colors hover:bg-coral/10 disabled:opacity-40"
          >
            {t("common.actions.retry")}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!valid || busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {busy ? t("profile.actions.savingBasics") : t("profile.actions.saveBasics")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          {t("common.actions.cancel")}
        </button>
        {!nameValid ? <span className="text-xs text-coral">{t("profile.basics.nameRequired")}</span> : null}
      </div>
    </div>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  maxLength,
  invalid,
  error,
  errorId,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  maxLength: number
  invalid?: boolean
  error?: string
  errorId?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        aria-invalid={invalid || undefined}
        aria-describedby={error ? errorId : undefined}
        className={
          "w-full rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus:ring-2 " +
          (invalid
            ? "border-coral focus:border-coral focus:ring-coral/30"
            : "border-input focus:border-ring focus:ring-ring/30")
        }
      />
      {error ? (
        <span id={errorId} className="mt-1 block text-xs text-coral">
          {error}
        </span>
      ) : null}
    </label>
  )
}
