// DES-014 结构化编辑器。编辑稳定 ID 对应的字段、章节与条目。
// 章节移动支持按钮（不只拖拽）。每次有效输入应重置 30s 静默计时（C-05），
// 这里通过 onDirty 通知上层更新保存状态。

import { useTranslation } from "react-i18next"
import type { ResumeDocument, ResumeSection } from "@/lib/types"
import { SourceBadge } from "@/components/kit/badges"
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react"

export function StructuredEditor({
  document,
  onChange,
}: {
  document: ResumeDocument
  onChange: (next: ResumeDocument) => void
}) {
  const { t } = useTranslation()

  function updateBasics<K extends keyof ResumeDocument["basics"]>(key: K, value: ResumeDocument["basics"][K]) {
    onChange({ ...document, basics: { ...document.basics, [key]: value } })
  }

  function updateSection(id: string, next: Partial<ResumeSection>) {
    onChange({ ...document, sections: document.sections.map((s) => (s.id === id ? { ...s, ...next } : s)) })
  }

  function moveSection(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= document.sections.length) return
    const sections = [...document.sections]
    ;[sections[index], sections[target]] = [sections[target], sections[index]]
    onChange({ ...document, sections })
  }

  return (
    <div className="space-y-5">
      {/* 基本信息 */}
      <section className="card-soft p-4">
        <h3 className="mb-3 text-sm font-bold text-foreground">{t("resume.structured.basics")}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledInput label={t("resume.structured.fullName")} value={document.basics.fullName} onChange={(v) => updateBasics("fullName", v)} />
          <LabeledInput label={t("resume.structured.headline")} value={document.basics.headline} onChange={(v) => updateBasics("headline", v)} />
          <LabeledInput label={t("resume.structured.email")} value={document.basics.email} onChange={(v) => updateBasics("email", v)} />
          <LabeledInput label={t("resume.structured.phone")} value={document.basics.phone} onChange={(v) => updateBasics("phone", v)} />
          <LabeledInput label={t("resume.structured.location")} value={document.basics.location} onChange={(v) => updateBasics("location", v)} />
        </div>
      </section>

      {/* 章节 */}
      {document.sections.map((sec, index) => (
        <section key={sec.id} className="card-soft p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <input
              value={sec.title}
              onChange={(e) => updateSection(sec.id, { title: e.target.value })}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-foreground outline-none hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/30"
              aria-label={t("resume.structured.sectionTitle", { title: sec.title })}
            />
            <div className="flex shrink-0 gap-1">
              <IconBtn label={t("resume.structured.moveSectionUp")} onClick={() => moveSection(index, -1)}><ChevronUp className="size-4" /></IconBtn>
              <IconBtn label={t("resume.structured.moveSectionDown")} onClick={() => moveSection(index, 1)}><ChevronDown className="size-4" /></IconBtn>
            </div>
          </div>

          {sec.text !== undefined ? (
            <textarea
              value={sec.text}
              onChange={(e) => updateSection(sec.id, { text: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              aria-label={t("resume.structured.sectionContent", { title: sec.title })}
            />
          ) : null}

          {sec.entries.map((entry) => (
            <div key={entry.id} className="mt-3 rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <input
                  value={entry.title}
                  onChange={(e) =>
                    updateSection(sec.id, { entries: sec.entries.map((en) => (en.id === entry.id ? { ...en, title: e.target.value } : en)) })
                  }
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-foreground outline-none hover:border-border focus:border-ring focus:ring-2 focus:ring-ring/30"
                  aria-label={t("resume.structured.entryTitle")}
                />
                {entry.period ? <span className="shrink-0 text-xs text-muted-foreground">{entry.period}</span> : null}
              </div>
              {entry.provenance ? <div className="mt-1.5"><SourceBadge provenance={entry.provenance} /></div> : null}
              <ul className="mt-2 space-y-1.5">
                {entry.bullets.map((b, bi) => (
                  <li key={bi} className="flex items-start gap-2">
                    <textarea
                      value={b}
                      rows={2}
                      onChange={(e) => {
                        const bullets = [...entry.bullets]
                        bullets[bi] = e.target.value
                        updateSection(sec.id, { entries: sec.entries.map((en) => (en.id === entry.id ? { ...en, bullets } : en)) })
                      }}
                      className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                      aria-label={t("resume.structured.bulletIndex", { index: bi + 1 })}
                    />
                    <IconBtn
                      label={t("resume.structured.deleteBullet")}
                      onClick={() =>
                        updateSection(sec.id, {
                          entries: sec.entries.map((en) => (en.id === entry.id ? { ...en, bullets: en.bullets.filter((_, i) => i !== bi) } : en)),
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </li>
                ))}
              </ul>
              <button
                onClick={() =>
                  updateSection(sec.id, { entries: sec.entries.map((en) => (en.id === entry.id ? { ...en, bullets: [...en.bullets, ""] } : en)) })
                }
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cobalt hover:underline"
              >
                <Plus className="size-3.5" aria-hidden /> {t("resume.structured.addBullet")}
              </button>
            </div>
          ))}
        </section>
      ))}
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
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      />
    </label>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
      {children}
    </button>
  )
}
