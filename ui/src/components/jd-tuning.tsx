// SCR-006 JD 详情与岗位微调。顶部固定摘要锁定「JD revision + Resume 基线 + 操作方式」。
// 改选微调目标不自动换绑（C-13 / BR-D12）；复制创建需确认（BR-D11）；
// JD revision 与 Resume 基线双重校验（BR-D08）。
// 页面还承载 JD 元数据维护（编辑生成新 revision / 删除 / 解绑）与确定性岗位匹配。

import { Link, useNavigate } from "react-router-dom"
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import type { JobDescription, Resume } from "@/lib/types"
import { deleteJd, duplicateResume, jdTuningPrompt, matchJob, releaseJdBinding, setJdBinding, startRun, updateJd } from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import i18n from "@/i18n"
import { JdBindingBadge } from "@/components/kit/badges"
import { PageHeader } from "@/components/kit/toolbar"
import { Modal } from "@/components/ui/modal"
import { cn } from "@/lib/utils"
import { ArrowLeft, Building2, Copy, Link2, PencilLine, Trash2, Unlink } from "lucide-react"

type Op = "direct" | "copy"

/** JD 写操作（编辑 / 删除 / 解绑 / 启动微调）的错误文案映射（C-06）：机器错误码 → i18n 文案。 */
function jdErrorMessage(cause: unknown, action: "save" | "delete" | "unbind" | "launch"): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "RATE_LIMITED" && action === "launch") return i18n.t("jd.tuning.errors.launchBusy")
    if (cause.code === "RESOURCE_NOT_FOUND") {
      return action === "delete" ? i18n.t("jd.tuning.errors.deleteFailed") : i18n.t("jd.tuning.errors.saveFailed")
    }
    if (cause.code === "FORBIDDEN" || cause.code === "UNAUTHENTICATED") {
      return action === "launch" ? i18n.t("jd.tuning.errors.launchFailed") : i18n.t("jd.tuning.errors.saveFailed")
    }
    if (cause.code === "NETWORK_ERROR") return i18n.t("common.errors.network")
  }
  if (action === "delete") return i18n.t("jd.tuning.errors.deleteFailed")
  if (action === "unbind") return i18n.t("jd.tuning.errors.unbindFailed")
  if (action === "launch") return i18n.t("jd.tuning.errors.launchFailed")
  return i18n.t("jd.tuning.errors.saveFailed")
}

function splitTags(value: string): string[] {
  return value
    .split(/[,，、]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function JdTuning({ jd, resumes }: { jd: JobDescription; resumes: Resume[] }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const boundAvailable = jd.boundResumeId && jd.boundResumeAvailable !== false
  const [targetId, setTargetId] = useState(boundAvailable ? jd.boundResumeId! : resumes[0]?.id ?? "")
  const [op, setOp] = useState<Op>("direct")
  const [rebind, setRebind] = useState(false)

  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [unbinding, setUnbinding] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [draft, setDraft] = useState({ role: jd.role, company: jd.company ?? "", body: jd.body, tags: jd.tags.join(", ") })

  const target = resumes.find((r) => r.id === targetId)
  const isReselected = targetId !== jd.boundResumeId
  const multiRef = (target?.boundByJdIds.length ?? 0) > 1

  // 岗位匹配是只读派生视图：挂载即算，输入来自 JD 与 Profile 事实，不调用模型。
  const match = useQuery({ queryKey: ["job-match", jd.id], queryFn: () => matchJob(jd.id) })

  /**
   * 启动岗位微调：Agent run 没有 jd_id 字段，run 绑简历、JD 上下文经 prompt 携带。
   * copy 模式先复制简历，rebind 时把目标简历显式绑定为该 JD 的当前绑定，然后起 run，
   * 最后进入编辑工作台由 Run 面板接手（Run 面板按 resume 读 active run）。
   */
  async function launch() {
    if (!targetId || launching) return
    setLaunching(true)
    setActionError(null)
    try {
      let runResumeId = targetId
      if (op === "copy") {
        const copy = await duplicateResume(targetId)
        runResumeId = copy.id
      }
      if (rebind) {
        await setJdBinding(jd.id, runResumeId)
        await queryClient.invalidateQueries({ queryKey: ["jd", jd.id] })
        await queryClient.invalidateQueries({ queryKey: ["jds"] })
      }
      await startRun(runResumeId, { prompt: jdTuningPrompt(jd, op) })
      navigate(`/resumes/${runResumeId}?panel=run`)
    } catch (cause) {
      setActionError(jdErrorMessage(cause, "launch"))
    } finally {
      setLaunching(false)
    }
  }

  function openEdit() {
    setDraft({ role: jd.role, company: jd.company ?? "", body: jd.body, tags: jd.tags.join(", ") })
    setActionError(null)
    setEditing(true)
  }

  async function saveEdit() {
    if (busy || !draft.role.trim() || !draft.body.trim()) return
    setBusy(true)
    setActionError(null)
    try {
      await updateJd(jd.id, {
        role: draft.role.trim(),
        company: draft.company.trim(),
        body: draft.body.trim(),
        tags: splitTags(draft.tags),
      })
      await queryClient.invalidateQueries({ queryKey: ["jd", jd.id] })
      await queryClient.invalidateQueries({ queryKey: ["jds"] })
      setEditing(false)
    } catch (cause) {
      setActionError(jdErrorMessage(cause, "save"))
    } finally {
      setBusy(false)
    }
  }

  async function removeJd() {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      await deleteJd(jd.id)
      await queryClient.invalidateQueries({ queryKey: ["jds"] })
      setRemoving(false)
      navigate("/jds")
    } catch (cause) {
      setActionError(jdErrorMessage(cause, "delete"))
    } finally {
      setBusy(false)
    }
  }

  async function unbind() {
    if (unbinding) return
    setUnbinding(true)
    setActionError(null)
    try {
      await releaseJdBinding(jd.id)
      await queryClient.invalidateQueries({ queryKey: ["jd", jd.id] })
      await queryClient.invalidateQueries({ queryKey: ["jds"] })
    } catch (cause) {
      setActionError(jdErrorMessage(cause, "unbind"))
    } finally {
      setUnbinding(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${jd.role}${jd.company ? " · " + jd.company : ""}`}
        description={t("jd.tuning.description")}
        actions={
          <Link to="/jds" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            <ArrowLeft className="size-4" aria-hidden /> {t("jd.tuning.backToLibrary")}
          </Link>
        }
      />

      {/* 顶部固定摘要：锁定写入目标 */}
      <div className="card-frame sticky top-2 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 p-3 text-xs">
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">JD</span><code className="font-mono text-foreground">{t("jd.revisionShort", { revision: jd.revision })}</code></span>
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">{t("jd.tuning.writeTarget")}</span><span className="font-medium text-foreground">{target?.title ?? t("jd.tuning.notSelected")}</span></span>
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">{t("jd.tuning.baseline")}</span><code className="font-mono text-foreground">{target?.currentVersionId ?? "—"}</code></span>
        <span className="flex items-center gap-1.5"><span className="text-muted-foreground">{t("jd.tuning.operationMode")}</span><span className="font-medium text-foreground">{op === "direct" ? t("jd.tuning.opDirect") : t("jd.tuning.opCopy")}</span></span>
        {isReselected ? <JdBindingBadge kind="reselected" /> : jd.boundResumeId ? <JdBindingBadge kind="bound" /> : <JdBindingBadge kind="unbound" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* 左：JD 原文 */}
        <article className="card-soft p-5">
          <div className="flex flex-wrap items-center gap-2">
            {jd.company ? <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Building2 className="size-3.5" aria-hidden /> {jd.company}</span> : null}
            <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("jd.revisionShort", { revision: jd.revision })}</span>
            {jd.sourceUrl ? (
              <a href={jd.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-cobalt hover:underline">
                <Link2 className="size-3" aria-hidden /> {t("jd.tuning.source")}
              </a>
            ) : null}
          </div>
          <h2 className="mt-3 text-sm font-semibold text-foreground">{t("jd.tuning.jobDescription")}</h2>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-7 text-foreground/90">{jd.body}</p>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
            <button onClick={openEdit} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
              <PencilLine className="size-3.5" aria-hidden /> {t("jd.tuning.editNewRevision")}
            </button>
            {jd.boundResumeId ? (
              <button
                onClick={() => void unbind()}
                disabled={unbinding}
                aria-busy={unbinding}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Unlink className="size-3.5" aria-hidden /> {unbinding ? t("jd.tuning.unbinding") : t("jd.tuning.unbind")}
              </button>
            ) : null}
            <button
              onClick={() => {
                setActionError(null)
                setRemoving(true)
              }}
              className="inline-flex items-center gap-1 rounded-md border border-coral/40 px-3 py-1.5 text-xs font-medium text-coral hover:bg-coral/5"
            >
              <Trash2 className="size-3.5" aria-hidden /> {t("jd.tuning.removeEntry")}
            </button>
          </div>
          {actionError && !editing && !removing ? <p role="alert" className="mt-3 text-xs text-coral">{actionError}</p> : null}
        </article>

        {/* 右：微调目标选择（SCR-104 内联） */}
        <aside className="card-soft h-fit space-y-4 p-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">{t("jd.tuning.selectTarget")}</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.id === jd.boundResumeId ? t("jd.tuning.currentBindingSuffix") : ""}
                  {r.lifecycle === "archived" ? t("jd.tuning.archivedSuffix") : ""}
                </option>
              ))}
            </select>
            {isReselected ? <p className="mt-1.5 text-xs text-gold">{t("jd.tuning.reselectedHint")}</p> : null}
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-foreground">{t("jd.tuning.operationMode")}</legend>
            <div className="grid gap-2">
              {([
                { k: "direct", l: "jd.tuning.opDirectLabel", d: "jd.tuning.opDirectHint" },
                { k: "copy", l: "jd.tuning.opCopy", d: "jd.tuning.opCopyHint" },
              ] as { k: Op; l: string; d: string }[]).map((o) => (
                <button
                  key={o.k}
                  onClick={() => setOp(o.k)}
                  aria-pressed={op === o.k}
                  className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-left transition-colors", op === o.k ? "border-cobalt bg-cobalt/5" : "border-border hover:bg-secondary")}
                >
                  {o.k === "copy" ? <Copy className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> : <PencilLine className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                  <span>
                    <span className="block text-sm font-medium text-foreground">{t(o.l)}</span>
                    <span className="block text-xs text-muted-foreground">{t(o.d)}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {op === "direct" && multiRef ? (
            <div className="rounded-lg border border-gold/60 bg-gold/15 p-2.5 text-xs leading-5 text-foreground">
              {t("jd.tuning.multiRefWarning", { refs: target?.boundByJdIds.length })}
            </div>
          ) : null}

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={rebind} onChange={(e) => setRebind(e.target.checked)} className="mt-0.5" />
            {t("jd.tuning.rebindLabel")}
          </label>

          <button
            onClick={() => void launch()}
            disabled={launching || !targetId}
            aria-busy={launching || undefined}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {launching ? t("jd.tuning.launching") : op === "copy" ? t("jd.tuning.confirmCopyLaunch") : t("jd.tuning.launch")}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">{t("jd.tuning.footerNote")}</p>
        </aside>
      </div>

      {/* 岗位匹配：确定性规则结果，展示事实级相关度与要求级覆盖 */}
      <section className="card-soft p-5" aria-label={t("jd.tuning.match.title")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg font-bold text-foreground">{t("jd.tuning.match.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("jd.tuning.match.description")}</p>
        </div>
        {match.isPending ? <p className="mt-3 text-sm text-muted-foreground">{t("jd.tuning.match.loading")}</p> : null}
        {match.isError ? <p role="alert" className="mt-3 text-sm text-coral">{t("jd.tuning.match.error")}</p> : null}
        {match.data ? (
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("jd.tuning.match.resultsTitle")}</h3>
              {match.data.results.length ? (
                <ul className="mt-2 space-y-2">
                  {match.data.results.map((result) => (
                    <li key={result.factId} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{result.factTitle}</p>
                        <span className="shrink-0 text-xs font-medium text-cobalt">{t("jd.tuning.match.relevance", { percent: Math.round(result.relevance * 100) })}</span>
                      </div>
                      {result.reason ? <p className="mt-1 text-xs text-muted-foreground">{t("jd.tuning.match.keywords")}: {result.reason}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{t("jd.tuning.match.emptyFacts")}</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t("jd.tuning.match.gapsTitle")}</h3>
              <ul className="mt-2 space-y-2">
                {match.data.gaps.map((gap) => (
                  <li key={gap.requirement} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">{gap.requirement}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium",
                          gap.status === "covered" ? "bg-cobalt/10 text-cobalt" : gap.status === "partial" ? "bg-gold/20 text-foreground" : "bg-coral/10 text-coral",
                        )}
                      >
                        {t(`jd.tuning.match.${gap.status}`)}
                      </span>
                    </div>
                    {gap.note ? (
                      <p className="mt-1 text-xs text-muted-foreground">{t("jd.tuning.match.gapNote", { title: gap.note })}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">{t("jd.tuning.match.gapNoNote")}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </section>

      <Modal
        open={editing}
        onOpenChange={(next) => {
          if (!next) {
            setEditing(false)
            setActionError(null)
          }
        }}
        title={t("jd.tuning.editTitle")}
        description={t("jd.tuning.editDescription")}
        className="max-w-2xl"
      >
        <div className="mt-5 grid gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("jd.tuning.fieldRole")}</span>
            <input
              value={draft.role}
              onChange={(e) => setDraft((prev) => ({ ...prev, role: e.target.value }))}
              disabled={busy}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("jd.tuning.fieldCompany")}</span>
            <input
              value={draft.company}
              onChange={(e) => setDraft((prev) => ({ ...prev, company: e.target.value }))}
              disabled={busy}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("jd.tuning.fieldBody")}</span>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
              rows={6}
              disabled={busy}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("jd.tuning.fieldTags")}</span>
            <input
              value={draft.tags}
              onChange={(e) => setDraft((prev) => ({ ...prev, tags: e.target.value }))}
              disabled={busy}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
            />
          </label>
        </div>
        {actionError ? <p role="alert" className="mt-3 text-xs text-coral">{actionError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => {
              setEditing(false)
              setActionError(null)
            }}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            {t("common.actions.cancel")}
          </button>
          <button
            onClick={() => void saveEdit()}
            disabled={busy || !draft.role.trim() || !draft.body.trim()}
            aria-busy={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t("jd.tuning.saving") : t("jd.tuning.save")}
          </button>
        </div>
      </Modal>

      <Modal
        open={removing}
        onOpenChange={(next) => {
          if (!next) {
            setRemoving(false)
            setActionError(null)
          }
        }}
        title={t("jd.tuning.removeTitle")}
        description={t("jd.tuning.removeDescription", { role: jd.role })}
      >
        {actionError ? <p role="alert" className="mt-3 text-xs text-coral">{actionError}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => {
              setRemoving(false)
              setActionError(null)
            }}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary disabled:opacity-40"
          >
            {t("common.actions.cancel")}
          </button>
          <button
            onClick={() => void removeJd()}
            disabled={busy}
            aria-busy={busy}
            className="rounded-lg bg-coral px-4 py-2 text-sm font-semibold text-white hover:bg-coral/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? t("jd.tuning.removing") : t("jd.tuning.removeConfirm")}
          </button>
        </div>
      </Modal>
    </div>
  )
}
