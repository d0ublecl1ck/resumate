// SCR-002 简历库。明确活跃 / 归档 / 删除恢复窗口；
// 网格卡片分层显示「内容版本 / 元数据变化 / 草稿状态」，避免把重命名误解为内容提交。
// 断点：lg 两列、xl 三列，更窄回落单列（左侧栏固定宽，两列从 1024 起才放得下四个操作）
// 筛选状态（tab / q / tag）与创建弹窗开关只以 URL 为真源，刷新与深链保持一致。
// 原型 #resume-library 是视觉依据。

import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import type { JobDescription, Resume, ResumeTemplate } from "@/lib/types"
import { archiveResume, duplicateResume, restoreResume } from "@/lib/api"
import { resumeCreateErrorMessage } from "@/lib/resume-create"
import { resumeLifecycleErrorMessage } from "@/lib/resume-lifecycle"
import { SaveStateBadge } from "@/components/kit/badges"
import { FilterToolbar, PageHeader } from "@/components/kit/toolbar"
import { StateBlock } from "@/components/kit/state-block"
import { CreateResumeModal } from "@/components/create-resume-modal"
import { Link2, Plus, Tag } from "lucide-react"

type Tab = "active" | "archived"

export function ResumeLibrary({ resumes, templates, jds }: { resumes: Resume[]; templates: ResumeTemplate[]; jds: JobDescription[] }) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  // URL 是唯一真源：Tab、搜索词、标签、创建弹窗开关都从这里读，刷新与深链才能保持一致。
  const tab: Tab = searchParams.get("tab") === "archived" ? "archived" : "active"
  const query = searchParams.get("q") ?? ""
  const tag = searchParams.get("tag") ?? undefined
  const createOpen = searchParams.get("create") === "1"

  function setParam(key: string, value?: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }

  const tabItems = useMemo(() => resumes.filter((resume) => resume.lifecycle === tab), [resumes, tab])
  // 标签 chips 只统计当前 Tab 的简历集合：归档 Tab 不再展示只存在于活跃简历的标签。
  const allTags = useMemo(() => Array.from(new Set(tabItems.flatMap((resume) => resume.tags))), [tabItems])

  const needle = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    return tabItems.filter((resume) => {
      // 大小写不敏感：标题与目标岗位一致对待。
      if (needle && !resume.title.toLowerCase().includes(needle) && !resume.targetRole.toLowerCase().includes(needle)) return false
      if (tag && !resume.tags.includes(tag)) return false
      return true
    })
  }, [tabItems, needle, tag])

  const hasFilter = Boolean(needle || tag)
  const emptyTitle = hasFilter
    ? t("resume.library.empty.filteredTitle")
    : tab === "archived"
      ? t("resume.library.empty.archivedTitle")
      : t("resume.library.empty.title")
  const emptyDescription = hasFilter
    ? t("resume.library.empty.filteredDescription")
    : tab === "archived"
      ? t("resume.library.empty.archivedDescription")
      : t("resume.library.empty.description")

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("resume.library.title")}
        description={t("resume.library.description")}
        actions={
          <button onClick={() => setParam("create", "1")} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> {t("resume.library.newResume")}
          </button>
        }
      />

      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        {(["active", "archived"] as Tab[]).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setParam("tab", tabKey === "active" ? undefined : "archived")}
            aria-pressed={tab === tabKey}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === tabKey ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            {tabKey === "active" ? t("resume.library.tab.active") : t("resume.library.tab.archived")}
          </button>
        ))}
      </div>

      <FilterToolbar
        query={query}
        onQuery={(value) => setParam("q", value || undefined)}
        placeholder={t("resume.library.searchPlaceholder")}
        chips={allTags.map((label) => ({ key: label, label }))}
        activeChip={tag}
        onChip={(key) => setParam("tag", tag === key ? undefined : key)}
      />

      {filtered.length === 0 ? (
        <StateBlock kind="empty" title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((resume) => (
            <ResumeCard key={resume.id} resume={resume} jds={jds} />
          ))}
        </ul>
      )}

      <CreateResumeModal open={createOpen} onClose={() => setParam("create", undefined)} resumes={resumes} templates={templates} />
    </div>
  )
}

function ResumeCard({ resume, jds }: { resume: Resume; jds: JobDescription[] }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [copying, setCopying] = useState(false)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const boundJds = jds.filter((jd) => resume.boundByJdIds.includes(jd.id))
  const archived = resume.lifecycle === "archived"

  async function copy() {
    if (copying) return
    setActionError(null)
    setCopying(true)
    try {
      const clone = await duplicateResume(resume.id)
      await queryClient.invalidateQueries({ queryKey: ["resumes"] })
      await queryClient.invalidateQueries({ queryKey: ["workbench-summary"] })
      navigate(`/resumes/${clone.id}`)
    } catch (cause) {
      setActionError(resumeCreateErrorMessage(cause))
    } finally {
      setCopying(false)
    }
  }

  /** 归档 / 恢复：成功后失效列表与工作台摘要，卡片按新的 lifecycle 落到对应 Tab。 */
  async function toggleLifecycle() {
    if (lifecycleBusy) return
    setActionError(null)
    setLifecycleBusy(true)
    try {
      if (archived) await restoreResume(resume.id)
      else await archiveResume(resume.id)
      await queryClient.invalidateQueries({ queryKey: ["resumes"] })
      await queryClient.invalidateQueries({ queryKey: ["workbench-summary"] })
    } catch (cause) {
      setActionError(resumeLifecycleErrorMessage(cause, archived ? "restore" : "archive"))
    } finally {
      setLifecycleBusy(false)
    }
  }

  return (
    <li className="card-soft flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/resumes/${resume.id}`} className="font-serif text-lg font-bold text-foreground hover:underline">
            {resume.title}
          </Link>
          {archived ? (
            <span className="ml-2 inline-block whitespace-nowrap align-middle rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {t("resume.library.archivedBadge")}
            </span>
          ) : null}
        </div>
        <SaveStateBadge state={resume.saveState} className="shrink-0" />
      </div>

      {resume.targetRole.trim() ? (
        <p className="mt-1.5 text-sm text-muted-foreground">{t("resume.library.targetRole", { role: resume.targetRole })}</p>
      ) : null}

      {resume.tags.length ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {resume.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground">
              <Tag className="size-3" aria-hidden /> {tag}
            </span>
          ))}
        </div>
      ) : null}

      {boundJds.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="size-3.5 shrink-0" aria-hidden />
          {t("resume.library.boundJds")}
          {boundJds.map((j) => (
            <Link key={j.id} to={`/jds/${j.id}`} className="text-cobalt hover:underline">{j.role}{j.company ? `·${j.company}` : ""}</Link>
          ))}
        </div>
      ) : null}

      {/* 三层状态：内容版本 / 元数据 / 草稿状态 分开显示 */}
      <dl className="mt-3 mb-4 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-baseline gap-1.5">
          <dt className="shrink-0">{t("resume.library.currentVersion")}</dt>
          <dd className="min-w-0 truncate font-mono text-foreground" title={resume.currentVersionId ?? undefined}>{resume.currentVersionId}</dd>
        </div>
        <div>{t("resume.library.templateRevision", { revision: resume.templateVersion })}</div>
        <div>{t("resume.library.lastEdited", { date: resume.updatedAt.slice(0, 16).replace("T", " ") })}</div>
      </dl>

      {/* 操作区压成一行：三列宽度下四颗按钮不折行，因此次级操作不带图标、内边距收紧。 */}
      <div className="mt-auto flex flex-wrap gap-1.5 border-t border-border pt-3">
        <Link to={`/resumes/${resume.id}`} className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">{t("resume.library.openEditor")}</Link>
        <Link to={`/resumes/${resume.id}/versions`} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
          {t("resume.library.versionHistory")}
        </Link>
        <button
          onClick={copy}
          disabled={copying}
          aria-busy={copying}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("common.actions.copy")}
        </button>
        <button
          onClick={toggleLifecycle}
          disabled={lifecycleBusy}
          aria-busy={lifecycleBusy}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {archived ? t("resume.library.restore") : t("resume.library.archive")}
        </button>
      </div>
      {actionError ? <p role="alert" className="mt-2 text-xs text-coral">{actionError}</p> : null}
    </li>
  )
}
