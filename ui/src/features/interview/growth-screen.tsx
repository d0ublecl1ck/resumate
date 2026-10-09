// 练习计划与成长曲线（Epic 14）：左侧真实练习项，右侧真实成长曲线。
// 曲线点全部来自 GET /interview/growth 的真实场次聚合；同口径才连线，换口径只并列。
// 交互：口径切换（同口径 / 全部记录）与练习项「开始复测」（POST /interview/practice-items/{id}/retest）。
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleCheck } from "lucide-react"
import { getInterviewGrowth, listPracticeItems, startPracticeRetest } from "@/lib/interview"
import type { InterviewGrowthSeries } from "@/lib/interview"
import { userFacingError } from "@/lib/api-error-text"
import { Panel, SectionHeader } from "./section-header"

type Scope = "same" | "all"

// 纵轴按真实分数 0–100 排布；曲线几何随数据点数量自适应。
const PLOT = { left: 46, right: 528, top: 30, bottom: 232, min: 0, max: 100 }
const Y_TICKS = [0, 20, 40, 60, 80, 100]

function scaleY(value: number) {
  const ratio = (value - PLOT.min) / (PLOT.max - PLOT.min)
  return PLOT.bottom - ratio * (PLOT.bottom - PLOT.top)
}

function formatDay(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")}`
}

function errorText(cause: unknown, t: (key: string, options?: { defaultValue?: string }) => string, ns: string): string {
  const fallback = t(`${ns}.errors.generic`)
  const { code } = userFacingError(cause, fallback)
  if (!code) return fallback
  return t(`interviewWorkflow.errors.${code}`, { defaultValue: "" }) || t(`${ns}.errors.${code}`, { defaultValue: fallback })
}

export function GrowthScreen() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<Scope>("all")

  const growthQuery = useQuery({ queryKey: ["interview", "growth"], queryFn: () => getInterviewGrowth() })
  const series = growthQuery.data?.series ?? []
  const primaryCaliberKey = growthQuery.data?.primaryCaliberKey ?? null
  const primary = series.find((item) => item.caliber.key === primaryCaliberKey) ?? series[0]
  const role = primary?.caliber.role
  const itemsQuery = useQuery({
    queryKey: ["interview", "practice-items", role ?? "all"],
    queryFn: () => listPracticeItems(role),
    enabled: Boolean(role),
  })
  const retest = useMutation({
    mutationFn: (id: string) => startPracticeRetest(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["interview", "practice-items"] })
      void queryClient.invalidateQueries({ queryKey: ["interview", "sessions"] })
    },
  })

  const shown: InterviewGrowthSeries[] = useMemo(() => {
    if (scope === "same") return primary ? [primary] : []
    return series
  }, [scope, primary, series])

  // 把所有展示系列的点排成一条横轴，逐段绘制；不同口径之间留出口径分界。
  const laidOut = useMemo(() => {
    const left = PLOT.left + 34
    const right = PLOT.right - 12
    const flat = shown.flatMap((item) => item.points.map((point) => ({ point, seriesKey: item.caliber.key })))
    const n = flat.length
    const xs = n <= 1 ? [(left + right) / 2] : flat.map((_, index) => left + (index * (right - left)) / (n - 1))
    return flat.map((entry, index) => ({ ...entry, x: xs[index] ?? left }))
  }, [shown])

  const showAll = scope === "all" && series.length > 1
  const retestPendingIds = retest.isPending ? [retest.variables ?? ""] : []
  const hasPoints = laidOut.length > 0

  return (
    <div className="flex flex-col">
      <SectionHeader
        eyebrow={t("interviewGrowth.header.eyebrow")}
        title={t("interviewGrowth.header.title")}
        description={t("interviewGrowth.header.description")}
        actions={
          <>
            <div
              role="group"
              aria-label={t("interviewGrowth.header.scopeLabel")}
              className="inline-flex rounded-lg border border-border bg-muted p-1"
            >
              {(["same", "all"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={scope === id}
                  onClick={() => setScope(id)}
                  className={
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                    (scope === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {t(id === "same" ? "interviewGrowth.header.scopeSame" : "interviewGrowth.header.scopeAll")}
                </button>
              ))}
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cobalt/40 bg-cobalt/5 px-3 py-1 text-xs font-medium text-cobalt">
              <span aria-hidden className="size-1.5 rounded-full bg-cobalt" />
              {t(showAll ? "interviewGrowth.header.scaleBadgeAll" : "interviewGrowth.header.scaleBadge")}
            </span>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] items-stretch gap-5">
        <Panel title={t("interviewGrowth.plan.title")} caption={t("interviewGrowth.plan.caption")} className="flex flex-col">
          <div className="mt-4 flex flex-1 flex-col gap-3">
            {!role ? (
              <p className="rounded-lg border border-dashed border-border bg-secondary px-3 py-6 text-center text-xs text-muted-foreground">
                {t("interviewGrowth.plan.emptyBody")}
              </p>
            ) : itemsQuery.isPending ? (
              <p className="text-xs text-muted-foreground">{t("interviewGrowth.state.loading")}</p>
            ) : itemsQuery.isError ? (
              <p className="rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">
                {errorText(itemsQuery.error, t, "interviewGrowth")}
              </p>
            ) : (itemsQuery.data ?? []).length === 0 ? (
              <p className="rounded-lg border border-dashed border-border bg-secondary px-3 py-6 text-center text-xs text-muted-foreground">
                {t("interviewGrowth.plan.emptyBody")}
              </p>
            ) : (
              (itemsQuery.data ?? []).map((item) => {
                const done = Boolean(item.retestSessionId)
                const pending = retestPendingIds.includes(item.id)
                return (
                  <article key={item.id} className="rounded-lg border border-border bg-secondary p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {t("interviewGrowth.dimensions." + item.dimension)}
                      </h3>
                      <div className="flex shrink-0 items-center gap-2">
                        {done ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-cobalt/40 bg-cobalt/5 px-2 py-0.5 text-xs font-medium text-cobalt">
                            <CircleCheck className="size-3" aria-hidden />
                            {t("interviewGrowth.plan.retested")}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 rounded-md border border-coral bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral">
                          {t("interviewGrowth.plan.weakTag")}
                        </span>
                      </div>
                    </div>
                    <dl className="mt-3 space-y-2">
                      <div className="flex gap-3 text-xs">
                        <dt className="w-16 shrink-0 text-muted-foreground">{t("interviewGrowth.plan.rows.goal")}</dt>
                        <dd className="min-w-0 flex-1 font-medium text-foreground">{item.goal || t("interviewGrowth.plan.rows.empty")}</dd>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <dt className="w-16 shrink-0 text-muted-foreground">{t("interviewGrowth.plan.rows.material")}</dt>
                        <dd className="min-w-0 flex-1 text-foreground">{item.material || t("interviewGrowth.plan.rows.empty")}</dd>
                      </div>
                      <div className="flex gap-3 text-xs">
                        <dt className="w-16 shrink-0 text-muted-foreground">{t("interviewGrowth.plan.rows.retest")}</dt>
                        <dd className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <span className="text-foreground">
                            {done ? t("interviewGrowth.plan.retestDone") : item.rubricVersion}
                          </span>
                          <button
                            type="button"
                            disabled={done || pending}
                            onClick={() => retest.mutate(item.id)}
                            className={
                              "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                              (done ? "border-cobalt bg-cobalt/10 text-cobalt" : "border-border bg-card text-cobalt hover:bg-accent")
                            }
                          >
                            {done ? <CircleCheck className="size-3.5" aria-hidden /> : null}
                            {done ? t("interviewGrowth.plan.retested") : pending ? t("interviewGrowth.plan.retesting") : t("interviewGrowth.plan.retestAction")}
                          </button>
                        </dd>
                      </div>
                    </dl>
                  </article>
                )
              })
            )}
            {retest.isError ? (
              <p className="rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">
                {errorText(retest.error, t, "interviewGrowth")}
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title={t("interviewGrowth.chart.title")} caption={t("interviewGrowth.chart.caption")} className="flex flex-col">
          {growthQuery.isPending ? (
            <p className="mt-4 text-xs text-muted-foreground">{t("interviewGrowth.state.loading")}</p>
          ) : growthQuery.isError ? (
            <p className="mt-4 rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">
              {errorText(growthQuery.error, t, "interviewGrowth")}
            </p>
          ) : !hasPoints ? (
            <p className="mt-4 rounded-lg border border-dashed border-border bg-secondary px-3 py-8 text-center text-xs text-muted-foreground">
              {t("interviewGrowth.chart.empty")}
            </p>
          ) : (
            <div className="mt-4 h-80 w-full">
              <svg viewBox="0 0 560 300" className="h-full w-full" role="img" aria-label={t("interviewGrowth.chart.title")}>
                {Y_TICKS.map((tick) => (
                  <g key={tick}>
                    <line x1={PLOT.left} y1={scaleY(tick)} x2={PLOT.right} y2={scaleY(tick)} className="text-border" stroke="currentColor" strokeWidth={1} strokeDasharray="4 4" />
                    <text x={PLOT.left - 8} y={scaleY(tick) + 4} textAnchor="end" className="text-muted-foreground" fill="currentColor" fontSize={11}>
                      {tick}
                    </text>
                  </g>
                ))}
                <line x1={PLOT.left} y1={PLOT.bottom} x2={PLOT.right} y2={PLOT.bottom} className="text-border" stroke="currentColor" strokeWidth={1.5} />
                <line x1={PLOT.left} y1={PLOT.top} x2={PLOT.left} y2={PLOT.bottom} className="text-border" stroke="currentColor" strokeWidth={1.5} />
                <text x={16} y={132} transform="rotate(-90 16 132)" textAnchor="middle" className="text-muted-foreground" fill="currentColor" fontSize={11}>
                  {t("interviewGrowth.chart.yUnit")}
                </text>

                {shown.map((item, index) => {
                  const entries = laidOut.filter((entry) => entry.seriesKey === item.caliber.key)
                  const points = entries.map((entry) => `${entry.x},${scaleY(entry.point.average ?? 0)}`).join(" ")
                  const isPrimary = index === 0
                  return (
                    <g key={item.caliber.key}>
                      <polyline
                        points={points}
                        fill="none"
                        className={isPrimary ? "text-cobalt" : "text-muted-foreground"}
                        stroke="currentColor"
                        strokeWidth={isPrimary ? 3 : 2}
                        strokeDasharray={isPrimary ? undefined : "6 5"}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {entries.map((entry) => (
                        <g key={entry.point.sessionId}>
                          {isPrimary ? (
                            <circle cx={entry.x} cy={scaleY(entry.point.average ?? 0)} r={5} className="text-cobalt" fill="currentColor" />
                          ) : (
                            <rect
                              x={entry.x - 4}
                              y={scaleY(entry.point.average ?? 0) - 4}
                              width={8}
                              height={8}
                              transform={`rotate(45 ${entry.x} ${scaleY(entry.point.average ?? 0)})`}
                              className="text-muted-foreground"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                            />
                          )}
                          <text
                            x={entry.x}
                            y={scaleY(entry.point.average ?? 0) - 12}
                            textAnchor="middle"
                            className={isPrimary ? "text-cobalt" : "text-muted-foreground"}
                            fill="currentColor"
                            fontSize={isPrimary ? 13 : 12}
                            fontWeight={600}
                          >
                            {entry.point.average ?? "-"}
                          </text>
                          <text x={entry.x} y={PLOT.bottom + 20} textAnchor="middle" className="text-muted-foreground" fill="currentColor" fontSize={10}>
                            {formatDay(entry.point.createdAt)}
                          </text>
                        </g>
                      ))}
                    </g>
                  )
                })}

                <text x={PLOT.left} y={PLOT.top - 12} className="text-foreground" fill="currentColor" fontSize={11} fontWeight={600}>
                  {t(showAll ? "interviewGrowth.chart.dividerNoteLine1" : "interviewGrowth.chart.sameScaleNoteLine1")}
                </text>
                <text x={PLOT.right} y={PLOT.top - 12} textAnchor="end" className="text-muted-foreground" fill="currentColor" fontSize={11}>
                  {t(showAll ? "interviewGrowth.chart.dividerNoteLine2" : "interviewGrowth.chart.sameScaleNoteLine2")}
                </text>

                <text x={PLOT.right} y={288} textAnchor="end" className="text-muted-foreground" fill="currentColor" fontSize={11}>
                  {t("interviewGrowth.chart.sourceNote", { role: primary?.caliber.role ?? "", rubric: primary?.caliber.rubricVersion ?? "" })}
                </text>
              </svg>
            </div>
          )}

          <div className="mt-3 rounded-lg border border-cobalt bg-cobalt/5 p-3">
            <p className="text-sm font-semibold text-cobalt">{t("interviewGrowth.chart.scaleNoticeTitle")}</p>
            <p className="mt-1 text-xs font-medium text-foreground">
              {t(showAll ? "interviewGrowth.chart.noticeAll" : "interviewGrowth.chart.noticeSame")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("interviewGrowth.chart.scaleNotice")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-6 rounded-full bg-cobalt" />
                {t("interviewGrowth.chart.legend.sameScale")}
              </span>
              {showAll ? (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rotate-45 border border-muted-foreground" />
                  {t("interviewGrowth.chart.legend.otherScale")}
                </span>
              ) : null}
            </div>
          </div>

          <p className="mt-3 rounded-lg border-l-2 border-cobalt bg-secondary px-3 py-2 text-xs text-secondary-foreground">
            {t("interviewGrowth.chart.reading", { n: growthQuery.data?.totalSessions ?? 0 })}
          </p>
        </Panel>
      </div>
    </div>
  )
}

export default GrowthScreen
