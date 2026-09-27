// SCR-004 事实直接编辑表单：新增与修正走同一套字段（US-7.1 / US-7.6）。
// 证据状态默认「待核实」，只有用户显式选择才成为「已核实」（BR-D09）；
// 可见性默认沿用事实卡片的「仅用于简历」（US-7.10 / BR-D05）。

import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { EvidenceStatus, FactType, FactVisibility, ProfileFact, ProfileFactInput } from "@/lib/types"
import { evidenceStatusLabel, FACT_TYPE_ORDER, factTypeLabel, factVisibilityLabel } from "@/lib/profile"

const VISIBILITY_ORDER: FactVisibility[] = ["private", "resume_only", "public"]
const EVIDENCE_STATUS_ORDER: EvidenceStatus[] = ["verified", "unverified", "no_evidence"]

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

  const valid = title.trim().length > 0 && content.trim().length > 0

  async function save() {
    if (!valid || busy) return
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
    } finally {
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
            placeholder={t("profile.factForm.titlePlaceholder")}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!valid || busy}
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
        {!valid ? <span className="text-xs text-coral">{t("profile.factForm.required")}</span> : null}
      </div>
    </div>
  )
}
