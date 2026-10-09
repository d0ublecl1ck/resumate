// 练习计划与复测（US-14.9 · SCR-149）：薄弱维度来自真实评估报告，练习项来自
// GET/POST/PATCH/DELETE /interview/practice-items，复测用 POST .../{id}/retest 发起。
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, ClipboardList, ListPlus, RotateCcw, Trash2 } from "lucide-react"
import {
  createPracticeItems,
  deletePracticeItem,
  getInterviewReport,
  listInterviewSessions,
  listPracticeItems,
  startPracticeRetest,
  updatePracticeItem,
} from "@/lib/interview"
import type { InterviewReportDimension, InterviewReportScore, PracticeItem } from "@/lib/interview"
import { userFacingError } from "@/lib/api-error-text"
import { Panel, SectionHeader } from "./section-header"

const PASS_LINE = 80
const STATUS_BADGE = "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-xs font-medium"
const BUTTON_BASE = "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium"

function isWeak(score: InterviewReportScore): boolean {
  return score.score === null || score.score < PASS_LINE
}

function weakScoreText(score: InterviewReportScore): number {
  return score.score ?? 0
}

function formatDate(value: string | null): string {
  if (!value) return "-"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10)
}

function errorText(cause: unknown, t: (key: string, options?: { defaultValue?: string }) => string): string {
  const fallback = t("interviewPlan.errors.generic")
  const { code } = userFacingError(cause, fallback)
  if (!code) return fallback
  return t(`interviewWorkflow.errors.${code}`, { defaultValue: "" }) || fallback
}

function RecordField({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </span>
  )
}

export function PlanScreen() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [queuedIds, setQueuedIds] = useState<string[]>([])
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({})

  const sessionsQuery = useQuery({ queryKey: ["interview", "sessions"], queryFn: () => listInterviewSessions() })
  const latest = useMemo(
    () => (sessionsQuery.data ?? []).find((session) => session.hasReport) ?? null,
    [sessionsQuery.data],
  )
  const reportQuery = useQuery({
    queryKey: ["interview", "report", latest?.id ?? ""],
    queryFn: () => getInterviewReport(latest!.id),
    enabled: Boolean(latest),
  })
  const itemsQuery = useQuery({
    queryKey: ["interview", "practice-items", latest?.role ?? "all"],
    queryFn: () => listPracticeItems(latest?.role),
    enabled: Boolean(latest),
  })
  const items = itemsQuery.data ?? []

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["interview", "practice-items"] })
  }
  const create = useMutation({
    mutationFn: (dimension: InterviewReportDimension) => createPracticeItems(reportQuery.data!.id, dimension),
    onSuccess: invalidate,
  })
  const remove = useMutation({ mutationFn: (id: string) => deletePracticeItem(id), onSuccess: invalidate })
  const update = useMutation({
    mutationFn: (input: { id: string; goal?: string; status?: "active" | "done" }) =>
      updatePracticeItem(input.id, { goal: input.goal, status: input.status }),
    onSuccess: invalidate,
  })
  const retest = useMutation({
    mutationFn: (id: string) => startPracticeRetest(id),
    onSuccess: (_result, id) => {
      setQueuedIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setConfirmingId(null)
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ["interview", "sessions"] })
    },
  })

  useEffect(() => {
    if (!itemsQuery.data) return
    setGoalDrafts((prev) => {
      const next = { ...prev }
      for (const item of itemsQuery.data ?? []) {
        if (next[item.id] === undefined) next[item.id] = item.goal
      }
      return next
    })
  }, [itemsQuery.data])

  const report = reportQuery.data
  const weakDimensions = (report?.contentScores ?? []).filter(isWeak)
  // 分子与分母必须来自同一份评估报告：本次评估的练习项按 sourceReportId 对齐，
  // 更早评估留下的练习项单独成组展示，避免出现「已加入 2 / 0 项」这种混口径计数。
  const reportItems = useMemo(
    () => (report ? items.filter((item) => item.sourceReportId === report.id) : []),
    [items, report],
  )
  const earlierItems = useMemo(
    () => (report ? items.filter((item) => item.sourceReportId !== report.id) : items),
    [items, report],
  )
  const itemFor = (dimension: string): PracticeItem | undefined =>
    reportItems.find((item) => item.dimension === dimension)

  function addDimension(dimension: InterviewReportDimension) {
    if (!report) return
    create.mutate(dimension)
  }

  function removeDimension(dimension: InterviewReportDimension) {
    const item = itemFor(dimension)
    if (item) remove.mutate(item.id)
  }

  function saveGoal(item: PracticeItem) {
    const draft = goalDrafts[item.id]
    if (draft !== undefined && draft !== item.goal) update.mutate({ id: item.id, goal: draft })
  }

  const errorNotice = (cause: unknown) => (
    <p className="rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">{errorText(cause, t)}</p>
  )

  /** 练习项卡片：本次评估与更早评估共用同一套渲染，卡片上标出来源场次。 */
  function renderItemRow(item: PracticeItem) {
    const done = item.status === "done"
    const queued = queuedIds.includes(item.id) || Boolean(item.retestSessionId)
    const confirming = confirmingId === item.id
    const retestPending = retest.isPending && retest.variables === item.id
    return (
      <li key={item.id} className="rounded-lg border border-border bg-secondary p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={"size-2 shrink-0 rounded-full " + (done ? "bg-cobalt" : "bg-coral")} />
            <h3 className="truncate text-sm font-semibold text-foreground">
              {t("interviewPlan.dimensions." + item.dimension)}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={STATUS_BADGE + " " + (done ? "border-cobalt/40 bg-cobalt/5 text-cobalt" : "border-border bg-muted text-muted-foreground")}>
              {done ? t("interviewPlan.plan.statusDone") : t("interviewPlan.plan.statusActive")}
            </span>
            <button
              type="button"
              onClick={() => remove.mutate(item.id)}
              aria-label={t("interviewPlan.plan.remove") + " " + t("interviewPlan.dimensions." + item.dimension)}
              className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <label htmlFor={"plan-goal-" + item.id} className="w-10 shrink-0 text-xs text-muted-foreground">
            {t("interviewPlan.plan.goalLabel")}
          </label>
          <input
            id={"plan-goal-" + item.id}
            value={goalDrafts[item.id] ?? item.goal}
            placeholder={t("interviewPlan.plan.goalPlaceholder")}
            onChange={(event) => setGoalDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
            onBlur={() => saveGoal(item)}
            className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 py-1 text-sm text-foreground outline-none focus-visible:border-ring"
          />
        </div>

        <p className="mt-1 truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("interviewPlan.plan.materialLabel")}</span>
          {" · "}
          {item.material || t("interviewPlan.plan.materialEmpty")}
        </p>

        <p className="mt-1 truncate text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t("interviewPlan.plan.sourceLabel")}</span>
          {" · "}
          {t("interviewPlan.plan.sourceValue", { id: item.sourceSessionId })}
        </p>

        {!queued && !confirming ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={done}
              onClick={() => update.mutate({ id: item.id, status: "done" })}
              className={BUTTON_BASE + " " + (done ? "cursor-not-allowed border-border bg-muted text-muted-foreground" : "border-cobalt/40 bg-card text-cobalt")}
            >
              <CheckCircle2 className="size-3.5" aria-hidden />
              {done ? t("interviewPlan.plan.doneLabel") : t("interviewPlan.plan.markDone")}
            </button>
            <button type="button" onClick={() => setConfirmingId(item.id)} className={BUTTON_BASE + " border-border bg-card text-foreground"}>
              <RotateCcw className="size-3.5" aria-hidden />
              {t("interviewPlan.plan.retest")}
            </button>
          </div>
        ) : null}

        {confirming ? (
          <div className="mt-1.5 rounded-lg border border-cobalt bg-cobalt/5 p-2">
            <p className="text-xs font-medium text-cobalt">
              {t("interviewPlan.plan.retestNote", { id: latest?.id ?? "", rubric: latest?.rubricVersion ?? "" })}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button type="button" disabled={retestPending} onClick={() => retest.mutate(item.id)} className={BUTTON_BASE + " border-cobalt bg-cobalt text-background disabled:opacity-60"}>
                {retestPending ? t("interviewPlan.plan.retestStarting") : t("interviewPlan.plan.retestConfirm")}
              </button>
              <button type="button" onClick={() => setConfirmingId(null)} className={BUTTON_BASE + " border-border bg-card text-muted-foreground"}>
                {t("interviewPlan.plan.retestCancel")}
              </button>
            </div>
          </div>
        ) : null}

        {queued ? (
          <p className="mt-1.5 inline-flex items-start gap-1.5 rounded-lg border border-cobalt/40 bg-cobalt/5 px-2.5 py-1.5 text-xs text-foreground">
            <RotateCcw className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
            {item.retestSessionId
              ? t("interviewPlan.plan.retestQueuedWithId", { id: item.retestSessionId })
              : t("interviewPlan.plan.retestQueued")}
          </p>
        ) : null}
      </li>
    )
  }

  return (
    <div className="flex flex-col">
      <SectionHeader
        eyebrow={t("interviewPlan.header.eyebrow")}
        title={t("interviewPlan.header.title")}
        description={t("interviewPlan.header.description")}
      />

      {sessionsQuery.isPending ? (
        <p className="mb-4 text-xs text-muted-foreground">{t("interviewPlan.state.loading")}</p>
      ) : sessionsQuery.isError ? (
        <div className="mb-4">{errorNotice(sessionsQuery.error)}</div>
      ) : latest === null ? (
        <div className="mb-4 rounded-xl border border-dashed border-border bg-secondary px-5 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">{t("interviewPlan.record.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("interviewPlan.record.emptyBody")}</p>
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-5 py-2.5">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ClipboardList className="size-4 text-cobalt" aria-hidden />
            {t("interviewPlan.record.label")}
          </span>
          <span className="text-base font-semibold text-foreground">{latest.id}</span>
          <RecordField label={t("interviewPlan.record.scaleLabel")} value={latest.rubricVersion} />
          <RecordField label={t("interviewPlan.record.dateLabel")} value={formatDate(latest.completedAt ?? latest.createdAt)} />
          <RecordField label={t("interviewPlan.record.roleLabel")} value={latest.role} />
          <span className={STATUS_BADGE + " border-cobalt/40 bg-cobalt/5 text-cobalt"}>
            {latest.status === "completed" ? t("interviewPlan.record.state") : t("interviewPlan.record.stateActive")}
          </span>
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start gap-5">
        <Panel title={t("interviewPlan.weak.title")} caption={t("interviewPlan.weak.caption")}>
          <ul className="mt-3 flex flex-col gap-3">
            {reportQuery.isPending && latest ? <li className="text-xs text-muted-foreground">{t("interviewPlan.state.loading")}</li> : null}
            {reportQuery.isError ? <li>{errorNotice(reportQuery.error)}</li> : null}
            {!reportQuery.isPending && weakDimensions.length === 0 ? (
              <li className="rounded-lg border border-dashed border-border bg-secondary px-3 py-6 text-center text-xs text-muted-foreground">
                {t("interviewPlan.weak.empty")}
              </li>
            ) : null}
            {weakDimensions.map((score) => {
              const dimension = score.dimension
              const item = itemFor(dimension)
              const evidence = score.evidence[0] ?? report?.gaps[0] ?? ""
              const pending = create.isPending && create.variables === dimension
              return (
                <li key={dimension} className={"rounded-lg border p-3 " + (item ? "border-cobalt bg-cobalt/5" : "border-border bg-secondary")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{t("interviewPlan.dimensions." + dimension)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("interviewPlan.weak.scoreLine", { n: weakScoreText(score) })}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => (item ? removeDimension(dimension) : addDimension(dimension))}
                      className={
                        BUTTON_BASE +
                        " shrink-0 " +
                        (item ? "border-cobalt/40 bg-card text-cobalt" : "border-cobalt bg-cobalt text-background")
                      }
                    >
                      {item ? t("interviewPlan.weak.remove") : pending ? t("interviewPlan.weak.adding") : t("interviewPlan.weak.add")}
                    </button>
                  </div>
                  {evidence ? (
                    <p className="mt-2 text-xs leading-5 text-foreground">
                      <span className="text-muted-foreground">{t("interviewPlan.weak.evidenceLabel")}</span>
                      {" · "}
                      {evidence}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Panel>

        <Panel title={t("interviewPlan.plan.title")} caption={t("interviewPlan.plan.caption")}>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t("interviewPlan.plan.countValue", { n: reportItems.length, total: weakDimensions.length })}
            </span>
          </div>

          {itemsQuery.isError ? <div className="mt-2">{errorNotice(itemsQuery.error)}</div> : null}
          {remove.isError || update.isError || retest.isError ? (
            <div className="mt-2">
              {errorNotice(remove.error ?? update.error ?? retest.error)}
            </div>
          ) : null}
          {create.isError ? <div className="mt-2">{errorNotice(create.error)}</div> : null}

          {items.length === 0 ? (
            <div className="mt-2 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted px-6 py-8 text-center">
              <span className="flex size-11 items-center justify-center rounded-full border border-border bg-card text-cobalt">
                <ClipboardList className="size-5" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">{t("interviewPlan.plan.emptyTitle")}</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{t("interviewPlan.plan.emptyBody")}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cobalt">
                <ListPlus className="size-3.5" aria-hidden />
                {t("interviewPlan.plan.emptyHint")}
              </p>
            </div>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {reportItems.map((item) => renderItemRow(item))}
              {reportItems.length === 0 ? (
                <li className="rounded-lg border border-dashed border-border bg-muted px-3 py-4 text-center text-xs text-muted-foreground">
                  {t("interviewPlan.plan.noCurrentItems")}
                </li>
              ) : null}
              {earlierItems.length > 0 ? (
                <li className="pt-2 text-xs font-medium text-muted-foreground">
                  {t("interviewPlan.plan.earlierTitle")}
                </li>
              ) : null}
              {earlierItems.map((item) => renderItemRow(item))}
            </ul>
          )}

        </Panel>
      </div>
    </div>
  )
}

export default PlanScreen
