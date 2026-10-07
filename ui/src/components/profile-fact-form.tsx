// SCR-004 事实直接编辑表单：新增与修正走同一套字段（US-7.1 / US-7.6）。
// 证据状态默认「待核实」，只有用户显式选择才成为「已核实」（BR-D09）；
// 可见性默认沿用事实卡片的「仅用于简历」（US-7.10 / BR-D05）。

import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { EvidenceStatus, FactType, FactVisibility, ProfileFact, ProfileFactInput } from "@/lib/types"
import { userFacingError, type UserFacingError } from "@/lib/api-error-text"
import { evidenceStatusLabel, FACT_TYPE_ORDER, factTypeLabel, factVisibilityLabel } from "@/lib/profile"

const VISIBILITY_ORDER: FactVisibility[] = ["private", "resume_only", "public"]
const EVIDENCE_STATUS_ORDER: EvidenceStatus[] = ["verified", "unverified", "no_evidence"]
/** 与后端 ProfileFactCreate / ProfileFactUpdate 的 title max_length=200 对齐。 */
const TITLE_MAX_LENGTH = 200

export function ProfileFactForm({
  mode,
  defaultType,
  fact,
  onSave,
  onCancel,
}: {
  mode: "create" | "update"
  defaultType?: FactType
  fact?: ProfileFact
  onSave: (input: ProfileFactInput) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [type, setType] = useState<FactType>(fact?.type ?? defaultType ?? "experience")
  const [title, setTitle] = useState(fact?.title ?? "")
  const [content, setContent] = useState(fact?.content ?? "")
  const [tagsText, setTagsText] = useState((fact?.tags ?? []).join(t("common.listSeparator")))
  const [evidenceStatus, setEvidenceStatus] = useState<EvidenceStatus>(fact?.evidence.status ?? "unverified")
  const [evidenceLabel, setEvidenceLabel] = useState(fact?.evidence.label ?? "")
  const [visibility, setVisibility] = useState<FactVisibility>(fact?.visibility ?? "resume_only")
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<UserFacingError | null>(null)
  // 未提交过（pristine）不是错误：只有用户尝试提交且输入仍非法时才展示必填提示。
  const [submitAttempted, setSubmitAttempted] = useState(false)
  // busy 是异步 state，同一 tick 的第二次 click 读到的仍是 false；用 ref 做同步守卫，保证只落一条事实。
  const submittingRef = useRef(false)

  const titleTooLong = title.trim().length > TITLE_MAX_LENGTH
  const valid = title.trim().length > 0 && content.trim().length > 0 && !titleTooLong
  const showRequired = submitAttempted && (title.trim().length === 0 || content.trim().length === 0)
  const showTitleTooLong = submitAttempted && titleTooLong

  async function save() {
    setSubmitAttempted(true)
    if (submittingRef.current) return
    if (!valid) return
    submittingRef.current = true
    setSaveError(null)
    setBusy(true)
    try {
      await onSave({
        type,
        title: title.trim(),
        content: content.trim(),
        tags: tagsText
          .split(/[、,，]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        evidence: {
          status: evidenceStatus,
          label: evidenceStatus === "no_evidence" || !evidenceLabel.trim() ? undefined : evidenceLabel.trim(),
        },
        visibility,
      })
    } catch (cause) {
      // 保存失败必须落到界面上，不能变成未处理的 rejection；422 业务校验直接展示后端 message。
      setSaveError(userFacingError(cause, t("profile.factForm.saveError")))
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="card-soft p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-foreground">{mode === "update" ? t("profile.actions.editFact", { title: fact?.title ?? "" }) : t("profile.actions.addFact")}</p>
        <span className="text-[11px] text-muted-foreground">{t("profile.factForm.hint")}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("profile.fields.type")}</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FactType)}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {FACT_TYPE_ORDER.map((k) => (
              <option key={k} value={k}>{factTypeLabel(t, k)}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("profile.fields.visibility")}</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as FactVisibility)}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {VISIBILITY_ORDER.map((v) => (
              <option key={v} value={v}>{factVisibilityLabel(t, v)}</option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("profile.fields.title")}</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX_LENGTH}
            aria-invalid={showTitleTooLong || undefined}
            placeholder={t("profile.factForm.titlePlaceholder")}
            className={
              "w-full rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus:ring-2 " +
              (showTitleTooLong
                ? "border-coral focus:border-coral focus:ring-coral/30"
                : "border-input focus:border-ring focus:ring-ring/30")
            }
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("profile.fields.content")}</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder={t("profile.factForm.contentPlaceholder")}
            className="w-full resize-none rounded-md border border-input bg-card px-2.5 py-1.5 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("profile.fields.tags")}</span>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder={t("profile.factForm.tagsPlaceholder")}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("profile.fields.evidenceStatus")}</span>
          <select
            value={evidenceStatus}
            onChange={(e) => setEvidenceStatus(e.target.value as EvidenceStatus)}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {EVIDENCE_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{evidenceStatusLabel(t, s)}</option>
            ))}
          </select>
        </label>

        {evidenceStatus !== "no_evidence" ? (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("profile.fields.evidenceLabel")}</span>
            <input
              value={evidenceLabel}
              onChange={(e) => setEvidenceLabel(e.target.value)}
              placeholder={t("profile.factForm.evidenceLabelPlaceholder")}
              className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </label>
        ) : null}
      </div>

      {saveError ? (
        <p role="alert" className="mt-3 rounded-md bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
          <span>{saveError.message}</span>
          {saveError.code ? <span className="ml-2 font-mono">{saveError.code}</span> : null}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {busy ? t("profile.actions.savingFact") : mode === "update" ? t("profile.actions.saveFact") : t("profile.actions.addFact")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          {t("common.actions.cancel")}
        </button>
        {showRequired ? <span className="text-xs text-coral">{t("profile.factForm.required")}</span> : null}
        {showTitleTooLong ? <span className="text-xs text-coral">{t("profile.factForm.titleTooLong")}</span> : null}
      </div>
    </div>
  )
}
