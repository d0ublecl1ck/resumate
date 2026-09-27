// SCR-004 基本信息直接编辑表单。与「对话编辑」并存：两条路径写同一份主档数据。
// 控件样式沿用事实卡片与结构化编辑器（border-input / focus:ring-ring/30），不引入新视觉规则。

import { useState } from "react"
import type { ResumeBasics } from "@/lib/types"
import { Plus, Trash2 } from "lucide-react"

export function ProfileBasicsForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ResumeBasics
  onSave: (next: ResumeBasics) => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ResumeBasics>(() => structuredClone(initial))
  const [busy, setBusy] = useState(false)

  function set<K extends keyof ResumeBasics>(key: K, value: ResumeBasics[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function updateLink(index: number, patch: Partial<ResumeBasics["links"][number]>) {
    setDraft((prev) => ({ ...prev, links: prev.links.map((l, i) => (i === index ? { ...l, ...patch } : l)) }))
  }

  const valid = draft.fullName.trim().length > 0

  async function save() {
    if (!valid || busy) return
    setBusy(true)
    try {
      await onSave({
        ...draft,
        fullName: draft.fullName.trim(),
        headline: draft.headline.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        location: draft.location.trim(),
        links: draft.links
          .filter((l) => l.url.trim())
          .map((l) => ({ label: l.label.trim() || l.url.trim(), url: l.url.trim() })),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledInput label="姓名" value={draft.fullName} onChange={(v) => set("fullName", v)} />
        <LabeledInput label="一句话头衔" value={draft.headline} onChange={(v) => set("headline", v)} />
        <LabeledInput label="邮箱" value={draft.email} onChange={(v) => set("email", v)} />
        <LabeledInput label="电话" value={draft.phone} onChange={(v) => set("phone", v)} />
        <LabeledInput label="城市" value={draft.location} onChange={(v) => set("location", v)} />
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-muted-foreground">链接</legend>
        <ul className="space-y-2">
          {draft.links.map((link, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                value={link.label}
                onChange={(e) => updateLink(index, { label: e.target.value })}
                placeholder="名称"
                aria-label={`链接 ${index + 1} 名称`}
                className="w-28 shrink-0 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <input
                value={link.url}
                onChange={(e) => updateLink(index, { url: e.target.value })}
                placeholder="https://"
                aria-label={`链接 ${index + 1} 地址`}
                className="min-w-0 flex-1 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, links: prev.links.filter((_, i) => i !== index) }))}
                aria-label={`删除链接 ${index + 1}`}
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
          <Plus className="size-3.5" aria-hidden /> 添加链接
        </button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!valid || busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {busy ? "保存中…" : "保存基本信息"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
        >
          取消
        </button>
        {!valid ? <span className="text-xs text-coral">姓名不能为空。</span> : null}
      </div>
    </div>
  )
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
    </label>
  )
}
