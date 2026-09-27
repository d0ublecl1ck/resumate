// SCR-005 JD 库。区分「当前绑定」与「本次微调目标」；不可用绑定不自动替换。

import { Link } from "react-router-dom"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { JobDescription, Resume } from "@/lib/types"
import { JdBindingBadge } from "@/components/kit/badges"
import { PageHeader, FilterToolbar } from "@/components/kit/toolbar"
import { StateBlock } from "@/components/kit/state-block"
import { CreateJdModal } from "@/components/create-jd-modal"
import { cn } from "@/lib/utils"
import { ArrowRight, Building2, Link2, Plus, Tag } from "lucide-react"

export function JdLibrary({ jds, resumes }: { jds: JobDescription[]; resumes: Resume[] }) {
  const { t } = useTranslation()
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
        title={t("jd.library.title")}
        description={t("jd.library.description")}
        actions={
          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> {t("jd.create.title")}
          </button>
        }
      />

      <FilterToolbar
        query={query}
        onQuery={setQuery}
        placeholder={t("jd.library.searchPlaceholder")}
        chips={allTags.map((tagValue) => ({ key: tagValue, label: tagValue }))}
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
                    <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("jd.revisionShort", { revision: jd.revision })}</span>
                  </div>
                  {jd.company ? (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Building2 className="size-3.5" aria-hidden /> {jd.company}</p>
                  ) : null}
                  <p className="line-clamp-2 max-w-2xl text-sm leading-6 text-foreground/80">{jd.body}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {jd.tags.map((tagValue) => (
                      <span key={tagValue} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground"><Tag className="size-3" aria-hidden /> {tagValue}</span>
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                  {jd.boundResumeId ? (
                    jd.boundResumeAvailable === false ? (
                      <JdBindingBadge kind="unavailable" resumeTitle={t("jd.library.bindingUnavailable")} />
                    ) : (
                      <JdBindingBadge kind="bound" resumeTitle={resumeTitle(jd.boundResumeId)} />
                    )
                  ) : (
                    <JdBindingBadge kind="unbound" />
                  )}
                  <p className="text-xs text-muted-foreground">{t("jd.library.updated", { date: jd.updatedAt.slice(0, 10) })}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <Link to={`/jds/${jd.id}`} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                  {t("jd.library.startTuning")} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
                {jd.sourceUrl ? (
                  <a href={jd.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
                    <Link2 className="size-3.5" aria-hidden /> {t("jd.library.sourceLink")}
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <StateBlock
          kind="empty"
          title={query || tag ? t("jd.library.emptyFilteredTitle") : t("jd.library.emptyTitle")}
          description={query || tag ? t("jd.library.emptyFilteredDescription") : t("jd.library.emptyDescription")}
          action={
            query || tag ? undefined : (
              <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Plus className="size-4" aria-hidden /> {t("jd.create.title")}
              </button>
            )
          }
        />
      )}

      <CreateJdModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
    </div>
  )
}
