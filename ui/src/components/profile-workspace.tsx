// SCR-004 个人资料（主档）。像一份简历那样自上而下：基本信息 → 经历 → 项目 → 教育 → 技能 → 成果 → 证书。
// 两条维护路径：页面内表单直接编辑（US-7.1 / US-7.2 / US-7.6 / US-7.9 / US-7.10），
// 以及页头唯一的「对话维护资料」抽屉——对话助手维护的是整份主档，因此不在卡片上重复入口（C-07）。
// 这是简历的事实来源；生成简历时从这里选材。不展示被哪些简历引用（那是简历侧的事）。

import { Link } from "react-router-dom"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { FactType, Profile, ProfileFact, ProfileFactInput, ResumeBasics } from "@/lib/types"
import { createFactManually, updateBasics, updateFact } from "@/lib/api"
import { EvidenceBadge } from "@/components/kit/badges"
import { ProfileAssistant } from "@/components/profile-assistant"
import { ProfileBasicsForm } from "@/components/profile-basics-form"
import { ProfileFactForm } from "@/components/profile-fact-form"
import { cn } from "@/lib/utils"
import { Mail, MapPin, MessageSquarePlus, Pencil, Phone, Plus, Link2, Sparkles } from "lucide-react"

const SECTIONS: { type: FactType; titleKey: string; emptyKey: string }[] = [
  { type: "experience", titleKey: "profile.sections.experience.title", emptyKey: "profile.sections.experience.empty" },
  { type: "project", titleKey: "profile.sections.project.title", emptyKey: "profile.sections.project.empty" },
  { type: "education", titleKey: "profile.sections.education.title", emptyKey: "profile.sections.education.empty" },
  { type: "skill", titleKey: "profile.sections.skill.title", emptyKey: "profile.sections.skill.empty" },
  { type: "achievement", titleKey: "profile.sections.achievement.title", emptyKey: "profile.sections.achievement.empty" },
  { type: "certificate", titleKey: "profile.sections.certificate.title", emptyKey: "profile.sections.certificate.empty" },
]

/** 直接编辑中的事实表单：新增或修正某一条。 */
type FactEditor = { mode: "create"; type: FactType } | { mode: "update"; fact: ProfileFact }

export function ProfileWorkspace({ profile }: { profile: Profile }) {
  const { t } = useTranslation()
  const [basics, setBasics] = useState<ResumeBasics>(profile.basics)
  const [facts, setFacts] = useState<ProfileFact[]>(profile.facts)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [editingBasics, setEditingBasics] = useState(false)
  const [factEditor, setFactEditor] = useState<FactEditor | null>(null)

  const sections = SECTIONS.map((section) => ({
    ...section,
    title: t(section.titleKey),
    empty: t(section.emptyKey),
  }))

  function flash(id: string) {
    setFlashId(id)
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 2500)
  }

  function handleCommitFact(fact: ProfileFact, operation: "create" | "update") {
    setFacts((prev) => (operation === "update" ? prev.map((f) => (f.id === fact.id ? fact : f)) : [fact, ...prev]))
    flash(fact.id)
  }

  function handleCommitBasics(next: ResumeBasics) {
    setBasics(next)
  }

  async function handleSaveBasics(next: ResumeBasics) {
    const saved = await updateBasics(next)
    setBasics(saved)
    setEditingBasics(false)
  }

  async function handleSaveFact(input: ProfileFactInput) {
    if (factEditor?.mode === "update") {
      const current = factEditor.fact
      const verified = input.evidence.status === "verified"
      const saved = await updateFact(current.id, {
        ...current,
        ...input,
        confidence: verified ? 0.9 : 0.5,
        verifiedAt: verified ? (current.verifiedAt ?? new Date().toISOString()) : undefined,
      })
      setFacts((prev) => prev.map((f) => (f.id === saved.id ? saved : f)))
      setFactEditor(null)
      flash(saved.id)
      return
    }
    const created = await createFactManually(input)
    setFacts((prev) => [created, ...prev])
    setFactEditor(null)
    flash(created.id)
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">{t("profile.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("profile.subtitlePrefix")}
            <span className="font-semibold text-foreground">{profile.completeness}%</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAssistantOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border-[1.5px] border-foreground/20 bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            <MessageSquarePlus className="size-4 text-cobalt" aria-hidden /> {t("profile.actions.openAssistant")}
          </button>
          <Link to="/resumes?create=1" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Sparkles className="size-4" aria-hidden /> {t("profile.actions.generateResume")}
          </Link>
        </div>
      </div>

      {/* 基本信息（像简历表头）：直接编辑；对话入口统一在页头 */}
      <section className="card-frame p-6" aria-label={t("profile.basics.sectionAria")}>
        {editingBasics ? (
          <ProfileBasicsForm initial={basics} onSave={handleSaveBasics} onCancel={() => setEditingBasics(false)} />
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="font-serif text-2xl font-bold text-foreground">{basics.fullName}</h2>
              <p className="mt-1 text-sm text-foreground/80">{basics.headline}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                {basics.email ? (
                  <span className="inline-flex items-center gap-1.5"><Mail className="size-3.5" aria-hidden /> {basics.email}</span>
                ) : null}
                {basics.phone ? (
                  <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5" aria-hidden /> {basics.phone}</span>
                ) : null}
                {basics.location ? (
                  <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" aria-hidden /> {basics.location}</span>
                ) : null}
              </div>
              {basics.links.length ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {basics.links.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-cobalt hover:underline">
                      <Link2 className="size-3.5" aria-hidden /> {l.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0">
              <button
                onClick={() => setEditingBasics(true)}
                aria-label={t("profile.actions.editBasics")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cobalt/40 px-3 py-2 text-xs font-medium text-cobalt transition-colors hover:bg-cobalt/5"
              >
                <Pencil className="size-3.5" aria-hidden /> {t("profile.actions.edit")}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 分区：经历 / 项目 / 教育 / 技能 / 成果 / 证书 */}
      {sections.map((section) => {
        const items = facts.filter((f) => f.type === section.type)
        const creating = factEditor?.mode === "create" && factEditor.type === section.type
        return (
          <section key={section.type} aria-label={section.title}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground">
                {section.title}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{items.length}</span>
              </h2>
              <button
                onClick={() => setFactEditor({ mode: "create", type: section.type })}
                aria-label={t("profile.actions.addManually") + section.title}
                className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/20 bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Plus className="size-3.5" aria-hidden /> {t("profile.actions.addManually")}
              </button>
            </div>

            {creating ? (
              <div className="mb-3">
                <ProfileFactForm mode="create" defaultType={section.type} onSave={handleSaveFact} onCancel={() => setFactEditor(null)} />
              </div>
            ) : null}

            {items.length ? (
              <ul className="space-y-3">
                {items.map((f) => (
                  <FactRow
                    key={f.id}
                    fact={f}
                    flash={flashId === f.id}
                    editing={factEditor?.mode === "update" && factEditor.fact.id === f.id}
                    onEdit={() => setFactEditor({ mode: "update", fact: f })}
                    onCancelEdit={() => setFactEditor(null)}
                    onSaveEdit={handleSaveFact}
                  />
                ))}
              </ul>
            ) : creating ? null : (
              <button
                onClick={() => setFactEditor({ mode: "create", type: section.type })}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-4 py-4 text-left text-sm text-muted-foreground transition-colors hover:border-cobalt/40 hover:bg-secondary/60"
              >
                <Plus className="size-4 shrink-0 text-cobalt" aria-hidden />
                {section.empty}
              </button>
            )}
          </section>
        )
      })}

      <ProfileAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onCommitFact={handleCommitFact}
        onCommitBasics={handleCommitBasics}
      />
    </div>
  )
}

function FactRow({
  fact,
  flash,
  editing,
  onEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  fact: ProfileFact
  flash?: boolean
  editing: boolean
  onEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (input: ProfileFactInput) => Promise<void>
}) {
  const { t } = useTranslation()

  if (editing) {
    return (
      <li>
        <ProfileFactForm mode="update" fact={fact} onSave={onSaveEdit} onCancel={onCancelEdit} />
      </li>
    )
  }

  return (
    <li className={cn("card-soft p-4 transition-colors", flash && "border-cobalt bg-cobalt/5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{fact.title}</h3>
            <EvidenceBadge status={fact.evidence.status} />
          </div>
          <p className="mt-1.5 text-sm leading-6 text-foreground/80">{fact.content}</p>
          {fact.tags.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {fact.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">{tag}</span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          onClick={onEdit}
          aria-label={t("profile.actions.editFact", { title: fact.title })}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-cobalt/40 px-2.5 py-1.5 text-xs font-medium text-cobalt transition-colors hover:bg-cobalt/5"
        >
          <Pencil className="size-3.5" aria-hidden /> {t("profile.actions.edit")}
        </button>
      </div>
    </li>
  )
}
