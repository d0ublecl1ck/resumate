// SCR-002 简历库。明确活跃 / 归档 / 删除恢复窗口；
// 列表分层显示「内容版本 / 元数据变化 / 草稿状态」，避免把重命名误解为内容提交。

import { Link, useSearchParams } from "react-router-dom"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { JobDescription, Resume, ResumeTemplate } from "@/lib/types"
import { SaveStateBadge } from "@/components/kit/badges"
import { FilterToolbar, PageHeader } from "@/components/kit/toolbar"
import { StateBlock } from "@/components/kit/state-block"
import { CreateResumeModal } from "@/components/create-resume-modal"
import { Archive, Copy, History, Link2, Plus, Tag } from "lucide-react"

type Tab = "active" | "archived"

export function ResumeLibrary({ resumes, templates, jds }: { resumes: Resume[]; templates: ResumeTemplate[]; jds: JobDescription[] }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>("active")
  const [query, setQuery] = useState("")
  const [tag, setTag] = useState<string | undefined>()
  const [createOpen, setCreateOpen] = useState(searchParams.get("create") === "1")

  const allTags = useMemo(() => Array.from(new Set(resumes.flatMap((r) => r.tags))), [resumes])

  const filtered = useMemo(() => {
    return resumes.filter((r) => {
      if (tab === "active" && r.lifecycle !== "active") return false
      if (tab === "archived" && r.lifecycle !== "archived") return false
      if (query && !r.title.includes(query) && !r.targetRole.includes(query)) return false
      if (tag && !r.tags.includes(tag)) return false
      return true
    })
  }, [resumes, tab, query, tag])

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("resume.library.title")}
        description={t("resume.library.description")}
        actions={
          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> {t("resume.library.newResume")}
          </button>
        }
      />

      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        {(["active", "archived"] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            aria-pressed={tab === tabKey}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === tabKey ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            {tabKey === "active" ? t("resume.library.tab.active") : t("resume.library.tab.archived")}
          </button>
        ))}
      </div>

      <FilterToolbar
        query={query}
        onQuery={setQuery}
        placeholder={t("resume.library.searchPlaceholder")}
        chips={allTags.map((t) => ({ key: t, label: t }))}
        activeChip={tag}
        onChip={(k) => setTag((prev) => (prev === k ? undefined : k))}
      />

      {filtered.length === 0 ? (
        <StateBlock
          kind="empty"
          title={query || tag ? t("resume.library.empty.filteredTitle") : tab === "archived" ? t("resume.library.empty.archivedTitle") : t("resume.library.empty.title")}
          description={query || tag ? t("resume.library.empty.filteredDescription") : t("resume.library.empty.description")}
        />
      ) : (
        <ul className="grid gap-4">
          {filtered.map((r) => (
            <ResumeRow key={r.id} resume={r} jds={jds} />
          ))}
        </ul>
      )}

      <CreateResumeModal open={createOpen} onClose={() => setCreateOpen(false)} templates={templates} jds={jds} />
    </div>
  )
}

function ResumeRow({ resume, jds }: { resume: Resume; jds: JobDescription[] }) {
  const { t } = useTranslation()
  const boundJds = jds.filter((j) => resume.boundByJdIds.includes(j.id))
  return (
    <li className="card-soft p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/resumes/${resume.id}`} className="font-serif text-lg font-bold text-foreground hover:underline">
              {resume.title}
            </Link>
            {resume.lifecycle === "archived" ? <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("resume.library.archivedBadge")}</span> : null}
          </div>
          <p className="text-sm text-muted-foreground">{t("resume.library.targetRole", { role: resume.targetRole })}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {resume.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground">
                <Tag className="size-3" aria-hidden /> {t}
              </span>
            ))}
          </div>
          {boundJds.length ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Link2 className="size-3.5" aria-hidden />
              {t("resume.library.boundJds")}
              {boundJds.map((j) => (
                <Link key={j.id} to={`/jds/${j.id}`} className="text-cobalt hover:underline">{j.role}{j.company ? `·${j.company}` : ""}</Link>
              ))}
            </div>
          ) : null}
        </div>

        {/* 三层状态：内容版本 / 元数据 / 草稿状态 分开显示 */}
        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          <SaveStateBadge state={resume.saveState} />
          <p className="text-xs text-muted-foreground">
            {t("resume.library.currentVersion")} <code className="font-mono text-foreground">{resume.currentVersionId}</code>
          </p>
          <p className="text-xs text-muted-foreground">{t("resume.library.templateRevision", { revision: resume.templateVersion })}</p>
          <p className="text-xs text-muted-foreground">{t("resume.library.lastEdited", { date: resume.updatedAt.slice(0, 16).replace("T", " ") })}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <Link to={`/resumes/${resume.id}`} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">{t("resume.library.openEditor")}</Link>
        <Link to={`/resumes/${resume.id}/versions`} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
          <History className="size-3.5" aria-hidden /> {t("resume.library.versionHistory")}
        </Link>
        <button className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
          <Copy className="size-3.5" aria-hidden /> {t("common.actions.copy")}
        </button>
        <button className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary">
          <Archive className="size-3.5" aria-hidden /> {resume.lifecycle === "archived" ? t("resume.library.restore") : t("resume.library.archive")}
        </button>
      </div>
    </li>
  )
}
