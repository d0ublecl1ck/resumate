// SCR-004 事实直接编辑表单：新增与修正走同一套字段（US-7.1 / US-7.6）。
// 证据状态默认「待核实」，只有用户显式选择才成为「已核实」（BR-D09）；
// 可见性默认沿用事实卡片的「仅用于简历」（US-7.10 / BR-D05）。

import { useState } from "react"
import type { EvidenceStatus, FactType, FactVisibility, ProfileFact, ProfileFactInput } from "@/lib/types"
import {
  EVIDENCE_STATUS_LABEL,
  FACT_TYPE_LABEL,
  FACT_TYPE_ORDER,
  FACT_VISIBILITY_LABEL,
} from "@/lib/profile"

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
  const [type, setType] = useState<FactType>(fact?.type ?? defaultType ?? "experience")
  const [title, setTitle] = useState(fact?.title ?? "")
  const [content, setContent] = useState(fact?.content ?? "")
  const [tagsText, setTagsText] = useState((fact?.tags ?? []).join("、"))
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
          .map((t) => t.trim())
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
        <p className="text-sm font-bold text-foreground">{mode === "update" ? `编辑「${fact?.title ?? ""}」` : "新增事实"}</p>
        <span className="text-[11px] text-muted-foreground">直接写入主档 · 默认待核实</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">类型</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FactType)}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {FACT_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>{FACT_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">可见性</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as FactVisibility)}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {(Object.keys(FACT_VISIBILITY_LABEL) as FactVisibility[]).map((v) => (
              <option key={v} value={v}>{FACT_VISIBILITY_LABEL[v]}</option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">标题</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：商详页性能优化"
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">内容</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="写清发生了什么、你做了什么、结果如何。"
            className="w-full resize-none rounded-md border border-input bg-card px-2.5 py-1.5 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">标签（用、或,分隔）</span>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="性能优化、React"
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">证据状态</span>
          <select
            value={evidenceStatus}
            onChange={(e) => setEvidenceStatus(e.target.value as EvidenceStatus)}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          >
            {(Object.keys(EVIDENCE_STATUS_LABEL) as EvidenceStatus[]).map((s) => (
              <option key={s} value={s}>{EVIDENCE_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>

        {evidenceStatus !== "no_evidence" ? (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">证据说明（可选）</span>
            <input
              value={evidenceLabel}
              onChange={(e) => setEvidenceLabel(e.target.value)}
              placeholder="例如：季度复盘文档"
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
          {busy ? "保存中…" : mode === "update" ? "保存修改" : "添加事实"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          取消
        </button>
        {!valid ? <span className="text-xs text-coral">标题与内容不能为空。</span> : null}
      </div>
    </div>
  )
}
