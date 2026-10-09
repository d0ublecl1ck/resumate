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
import { archiveResume, deleteResume, duplicateResume, restoreResume, updateResume } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import i18n from "@/i18n"
import { resumeCreateErrorMessage } from "@/lib/resume-create"
import { resumeLifecycleErrorMessage } from "@/lib/resume-lifecycle"
import { SaveStateBadge } from "@/components/kit/badges"
import { FilterToolbar, PageHeader } from "@/components/kit/toolbar"
import { StateBlock } from "@/components/kit/state-block"
import { CreateResumeModal } from "@/components/create-resume-modal"
import { Modal } from "@/components/ui/modal"
import { Link2, Plus, Tag, X } from "lucide-react"

/** 元数据编辑 / 删除的错误文案映射（C-06）：机器错误码 → i18n 文案。 */
function resumeMetaErrorMessage(cause: unknown, action: "update" | "delete"): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "RESOURCE_NOT_FOUND") return i18n.t("resume.library.errors.missing")
    if (cause.code === "FORBIDDEN" || cause.code === "UNAUTHENTICATED") return i18n.t("resume.library.errors.permission")
    if (cause.code === "NETWORK_ERROR") return i18n.t("resume.library.errors.network")
  }
  return action === "update" ? i18n.t("resume.library.errors.updateFailed") : i18n.t("resume.library.errors.deleteFailed")
}

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
  // 卡片元数据编辑：重命名 / 标签 / 删除各用一个弹窗，共用 busy 与错误出口。
  const [editor, setEditor] = useState<"rename" | "tags" | "delete" | null>(null)
  const [draftTitle, setDraftTitle] = useState(resume.title)
  const [draftTags, setDraftTags] = useState<string[]>(resume.tags)
  const [tagInput, setTagInput] = useState("")
  const [saving, setSaving] = useState(false)
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

  function openEditor(next: "rename" | "tags" | "delete") {
    setActionError(null)
    if (next === "rename") setDraftTitle(resume.title)
    if (next === "tags") {
      setDraftTags(resume.tags)
      setTagInput("")
    }
    setEditor(next)
  }

  function addTag() {
    const value = tagInput.trim()
    if (!value) return
    setDraftTags((prev) => (prev.includes(value) ? prev : [...prev, value]))
    setTagInput("")
  }

  async function refreshLibrary() {
    await queryClient.invalidateQueries({ queryKey: ["resumes"] })
    await queryClient.invalidateQueries({ queryKey: ["workbench-summary"] })
  }

  /** PATCH /resumes/{id}：只改元数据，不生成内容版本。 */
  async function saveMeta(patch: { title?: string; tags?: string[] }) {
    if (saving) return
    setActionError(null)
    setSaving(true)
    try {
      await updateResume(resume.id, patch)
      await refreshLibrary()
      setEditor(null)
    } catch (cause) {
      setActionError(resumeMetaErrorMessage(cause, "update"))
    } finally {
      setSaving(false)
    }
  }

  /** DELETE /resumes/{id}：软删除，成功后卡片从当前 Tab 消失。 */
  async function removeResume() {
    if (saving) return
    setActionError(null)
    setSaving(true)
    try {
      await deleteResume(resume.id)
      await refreshLibrary()
      setEditor(null)
    } catch (cause) {
      setActionError(resumeMetaErrorMessage(cause, "delete"))
    } finally {
      setSaving(false)
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

      {/* 操作区压成一行并允许换行：打开/历史/复制/重命名/标签/归档/删除。
          元数据编辑与删除各用一个小弹窗，危险操作必须确认。 */}
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
          onClick={() => openEditor("rename")}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          {t("resume.library.rename")}
        </button>
        <button
          onClick={() => openEditor("tags")}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          {t("resume.library.editTags")}
        </button>
        <button
          onClick={toggleLifecycle}
          disabled={lifecycleBusy}
          aria-busy={lifecycleBusy}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          {archived ? t("resume.library.restore") : t("resume.library.archive")}
        </button>
        <button
          onClick={() => openEditor("delete")}
          className="rounded-md border border-coral/40 px-2.5 py-1.5 text-xs font-medium text-coral hover:bg-coral/5"
        >
          {t("resume.library.delete")}
        </button>
      </div>
      {actionError && editor === null ? <p role="alert" className="mt-2 text-xs text-coral">{actionError}</p> : null}

      <Modal
        open={editor === "rename"}
        onOpenChange={(next) => {
          if (!next) {
            setEditor(null)
            setActionError(null)
          }
        }}
        title={t("resume.rename.title")}
        description={t("resume.rename.description")}
      >
        <label className="mt-5 block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("resume.rename.label")}</span>
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            maxLength={200}
            disabled={saving}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
          />
        </label>
        {actionError ? <p role="alert" className="mt-3 text-xs text-coral">{actionError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => { setEditor(null); setActionError(null) }} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">
            {t("common.actions.cancel")}
          </button>
          <button
            onClick={() => void saveMeta({ title: draftTitle.trim() })}
            disabled={saving || !draftTitle.trim()}
            aria-busy={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? t("resume.rename.saving") : t("resume.rename.save")}
          </button>
        </div>
      </Modal>

      <Modal
        open={editor === "tags"}
        onOpenChange={(next) => {
          if (!next) {
            setEditor(null)
            setActionError(null)
          }
        }}
        title={t("resume.tagsEdit.title")}
        description={t("resume.tagsEdit.description")}
      >
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {draftTags.length ? (
              draftTags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setDraftTags((prev) => prev.filter((item) => item !== tag))}
                    disabled={saving}
                    aria-label={t("resume.tagsEdit.remove", { tag })}
                    className="rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">{t("resume.tagsEdit.empty")}</span>
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("resume.tagsEdit.label")}</span>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addTag()
                  }
                }}
                disabled={saving}
                placeholder={t("resume.tagsEdit.placeholder")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={addTag}
                disabled={saving || !tagInput.trim()}
                className="shrink-0 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("resume.tagsEdit.add")}
              </button>
            </div>
          </label>
        </div>
        {actionError ? <p role="alert" className="mt-3 text-xs text-coral">{actionError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => { setEditor(null); setActionError(null) }} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">
            {t("common.actions.cancel")}
          </button>
          <button
            onClick={() => void saveMeta({ tags: draftTags })}
            disabled={saving}
            aria-busy={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? t("resume.tagsEdit.saving") : t("resume.tagsEdit.save")}
          </button>
        </div>
      </Modal>

      <Modal
        open={editor === "delete"}
        onOpenChange={(next) => {
          if (!next) {
            setEditor(null)
            setActionError(null)
          }
        }}
        title={t("resume.remove.title")}
        description={t("resume.remove.description", { title: resume.title })}
      >
        {actionError ? <p role="alert" className="mt-3 text-xs text-coral">{actionError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => { setEditor(null); setActionError(null) }} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">
            {t("common.actions.cancel")}
          </button>
          <button
            onClick={() => void removeResume()}
            disabled={saving}
            aria-busy={saving}
            className="rounded-lg bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? t("resume.remove.deleting") : t("resume.remove.confirm")}
          </button>
        </div>
      </Modal>
    </li>
  )
}
