// SCR-005 JD 库。区分「当前绑定」与「本次微调目标」；不可用绑定不自动替换。

import { Link } from "react-router-dom"
import { useMemo, useState } from "react"
import type { JobDescription, Resume } from "@/lib/types"
import { JdBindingBadge } from "@/components/kit/badges"
import { PageHeader, FilterToolbar } from "@/components/kit/toolbar"
import { StateBlock } from "@/components/kit/state-block"
import { CreateJdModal } from "@/components/create-jd-modal"
import { cn } from "@/lib/utils"
import { ArrowRight, Building2, Link2, Plus, Tag } from "lucide-react"

export function JdLibrary({ jds, resumes }: { jds: JobDescription[]; resumes: Resume[] }) {
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState<string | undefined>()
  const [items, setItems] = useState<JobDescription[]>(jds)
  const [createOpen, setCreateOpen] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const allTags = useMemo(() => Array.from(new Set(items.flatMap((j) => j.tags))), [items])

  const filtered = items.filter((j) => {
    if (query && !j.role.includes(query) && !(j.company ?? "").includes(query)) return false
    if (tag && !j.tags.includes(tag)) return false
    return true
  })

  function handleCreated(jd: JobDescription) {
    setItems((prev) => [jd, ...prev])
    setQuery("")
    setTag(undefined)
    setFlashId(jd.id)
    window.setTimeout(() => setFlashId((id) => (id === jd.id ? null : id)), 2500)
  }

  function resumeTitle(id?: string) {
    return resumes.find((r) => r.id === id)?.title
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="JD 库"
        description="集中保存岗位需求。每个 JD 显示 revision 与当前软绑定；绑定只是快速选定简历，不改变简历内容。"
        actions={
          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> 新增 JD
          </button>
        }
      />

      <FilterToolbar
        query={query}
        onQuery={setQuery}
        placeholder="按岗位或公司搜索…"
        chips={allTags.map((t) => ({ key: t, label: t }))}
        activeChip={tag}
        onChip={(k) => setTag((prev) => (prev === k ? undefined : k))}
      />

      {filtered.length ? (
        <ul className="grid gap-4">
          {filtered.map((jd) => (
            <li key={jd.id} className={cn("card-soft p-5 transition-colors", flashId === jd.id && "border-cobalt bg-cobalt/5")}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/jds/${jd.id}`} className="font-serif text-lg font-bold text-foreground hover:underline">{jd.role}</Link>
                    <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">rev.{jd.revision}</span>
                  </div>
                  {jd.company ? (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Building2 className="size-3.5" aria-hidden /> {jd.company}</p>
                  ) : null}
                  <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-foreground/80">{jd.body}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {jd.tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground"><Tag className="size-3" aria-hidden /> {t}</span>
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                  {jd.boundResumeId ? (
                    jd.boundResumeAvailable === false ? (
                      <JdBindingBadge kind="unavailable" resumeTitle="绑定简历不可用" />
                    ) : (
                      <JdBindingBadge kind="bound" resumeTitle={resumeTitle(jd.boundResumeId)} />
                    )
                  ) : (
                    <JdBindingBadge kind="unbound" />
                  )}
                  <p className="text-xs text-muted-foreground">更新 {jd.updatedAt.slice(0, 10)}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <Link to={`/jds/${jd.id}`} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                  发起岗位微调 <ArrowRight className="size-3.5" aria-hidden />
                </Link>
                {jd.sourceUrl ? (
                  <a href={jd.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
                    <Link2 className="size-3.5" aria-hidden /> 来源链接
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <StateBlock
          kind="empty"
          title={query || tag ? "没有匹配的 JD" : "还没有保存 JD"}
          description={query || tag ? "已保留筛选条件。" : "粘贴岗位文本或上传截图，AI 帮你整理成结构化 JD。"}
          action={
            query || tag ? undefined : (
              <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Plus className="size-4" aria-hidden /> 新增 JD
              </button>
            )
          }
        />
      )}

      <CreateJdModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
    </div>
  )
}
