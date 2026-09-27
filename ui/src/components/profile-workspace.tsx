// SCR-004 个人资料（主档）。像一份简历那样自上而下：基本信息 → 经历 → 项目 → 教育 → 技能 → 成果 → 证书。
// 所有内容都可用「对话」维护：改基本信息、新增/更新某段经历等，AI 整理后显式确认。
// 这是简历的事实来源；生成简历时从这里选材。不展示被哪些简历引用（那是简历侧的事）。

import { Link } from "react-router-dom"
import { useState } from "react"
import type { FactType, Profile, ProfileFact, ResumeBasics } from "@/lib/types"
import { EvidenceBadge } from "@/components/kit/badges"
import { ProfileAssistant } from "@/components/profile-assistant"
import { cn } from "@/lib/utils"
import { Mail, MapPin, MessageSquarePlus, Phone, Plus, Link2, Sparkles, Pencil } from "lucide-react"

const SECTIONS: { type: FactType; title: string; empty: string }[] = [
  { type: "experience", title: "职业经历", empty: "补充一段工作或实习经历，例如「2021 年起在某电商做高级前端」。" },
  { type: "project", title: "项目与作品", empty: "描述一个你主导或参与的项目及其成果。" },
  { type: "education", title: "教育背景", empty: "填写你的学历，例如「2018 年硕士毕业于某大学计算机专业」。" },
  { type: "skill", title: "技能专长", empty: "列出你擅长的技术或工具，例如「精通 React 与 TypeScript」。" },
  { type: "achievement", title: "成果与获奖", empty: "记录一次获奖或亮眼的量化成果。" },
  { type: "certificate", title: "证书资质", empty: "补充你考取的证书或资格认证。" },
]

export function ProfileWorkspace({ profile }: { profile: Profile }) {
  const [basics, setBasics] = useState<ResumeBasics>(profile.basics)
  const [facts, setFacts] = useState<ProfileFact[]>(profile.facts)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [prefill, setPrefill] = useState<{ hint: string } | null>(null)
  const [defaultType, setDefaultType] = useState<FactType | undefined>()
  const [flashId, setFlashId] = useState<string | null>(null)

  function openAssistant(opts?: { hint?: string; type?: FactType }) {
    setPrefill(opts?.hint ? { hint: opts.hint } : null)
    setDefaultType(opts?.type)
    setAssistantOpen(true)
  }

  function handleCommitFact(fact: ProfileFact, operation: "create" | "update") {
    setFacts((prev) => (operation === "update" ? prev.map((f) => (f.id === fact.id ? fact : f)) : [fact, ...prev]))
    setFlashId(fact.id)
    window.setTimeout(() => setFlashId((id) => (id === fact.id ? null : id)), 2500)
  }

  function handleCommitBasics(next: ResumeBasics) {
    setBasics(next)
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">个人资料</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            你的职业主档。简历从这里选材生成——完善度 <span className="font-semibold text-foreground">{profile.completeness}%</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => openAssistant()}
            className="inline-flex items-center gap-2 rounded-lg border-[1.5px] border-foreground/20 bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            <MessageSquarePlus className="size-4 text-cobalt" aria-hidden /> 对话维护资料
          </button>
          <Link to="/resumes?create=1" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Sparkles className="size-4" aria-hidden /> 生成简历
          </Link>
        </div>
      </div>

      {/* 基本信息（像简历表头） */}
      <section className="card-frame p-6" aria-label="基本信息">
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
          <button
            onClick={() => openAssistant({ hint: "把我的城市改成 " })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Pencil className="size-3.5" aria-hidden /> 对话编辑
          </button>
        </div>
      </section>

      {/* 分区：经历 / 项目 / 教育 / 技能 / 成果 / 证书 */}
      {SECTIONS.map((section) => {
        const items = facts.filter((f) => f.type === section.type)
        return (
          <section key={section.type} aria-label={section.title}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-serif text-lg font-bold text-foreground">
                {section.title}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{items.length}</span>
              </h2>
              <button
                onClick={() => openAssistant({ hint: `${section.title}：`, type: section.type })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Plus className="size-3.5" aria-hidden /> 对话添加
              </button>
            </div>

            {items.length ? (
              <ul className="space-y-3">
                {items.map((f) => (
                  <FactRow key={f.id} fact={f} flash={flashId === f.id} onUpdate={() => openAssistant({ hint: `补充「${f.title}」：` })} />
                ))}
              </ul>
            ) : (
              <button
                onClick={() => openAssistant({ hint: `${section.title}：`, type: section.type })}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-card/40 px-4 py-4 text-left text-sm text-muted-foreground transition-colors hover:border-cobalt/40 hover:bg-secondary/60"
              >
                <MessageSquarePlus className="size-4 shrink-0 text-cobalt" aria-hidden />
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
        prefill={prefill}
        defaultType={defaultType}
      />
    </div>
  )
}

function FactRow({ fact, flash, onUpdate }: { fact: ProfileFact; flash?: boolean; onUpdate: () => void }) {
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
              {fact.tags.map((t) => (
                <span key={t} className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">{t}</span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          onClick={onUpdate}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-cobalt/40 px-2.5 py-1.5 text-xs font-medium text-cobalt transition-colors hover:bg-cobalt/5"
        >
          <MessageSquarePlus className="size-3.5" aria-hidden /> 对话更新
        </button>
      </div>
    </li>
  )
}
