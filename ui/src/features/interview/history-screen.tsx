// 面试历史与口径比较（US-14.5）：左侧真实场次多选，右侧按口径给出「连线趋势」或「并列柱」。
// 口径校验来自后端 GET /interview/comparison：同岗位且同量表版本才 connectable。
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { listInterviewSessions, getInterviewComparison } from "@/lib/interview"
import type { InterviewComparisonSession, InterviewReportScore, InterviewSessionSummary } from "@/lib/interview"
import { userFacingError } from "@/lib/api-error-text"
import { Panel, SectionHeader } from "./section-header"

const DIMENSION_KEYS = ["correctness", "depth", "rigor", "fit"] as const

function caliberOf(record: InterviewSessionSummary): string {
  return record.role + "|" + record.rubricVersion
}

const TREND = { left: 64, right: 520, top: 24, bottom: 176, min: 0, max: 100 }
const TREND_TICKS = [0, 20, 40, 60, 80, 100]
const TREND_X_EARLIER = 200
const TREND_X_LATER = 384

function trendY(value: number): number {
  const ratio = (value - TREND.min) / (TREND.max - TREND.min)
  return TREND.bottom - ratio * (TREND.bottom - TREND.top)
}

const BARS = { baseline: 168, maxHeight: 128, width: 64, xs: [48, 188], min: 0, max: 100 }

function barHeight(score: number): number {
  const ratio = (score - BARS.min) / (BARS.max - BARS.min)
  return Math.max(2, Math.round(ratio * BARS.maxHeight))
}

function deltaMeta(delta: number): { arrow: string; className: string; labelKey: string } {
  if (delta > 0) return { arrow: "↑", className: "text-cobalt", labelKey: "interviewHistory.compare.deltaUp" }
  if (delta < 0) return { arrow: "↓", className: "text-coral", labelKey: "interviewHistory.compare.deltaDown" }
  return { arrow: "→", className: "text-muted-foreground", labelKey: "interviewHistory.compare.deltaFlat" }
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10)
}

function scoreMap(scores: InterviewReportScore[]): Record<string, number | null> {
  return Object.fromEntries(scores.map((item) => [item.dimension, item.score]))
}

function errorText(cause: unknown, t: (key: string, options?: { defaultValue?: string }) => string): string {
  const fallback = t("interviewHistory.errors.generic")
  const { code } = userFacingError(cause, fallback)
  if (!code) return fallback
  return t(`interviewWorkflow.errors.${code}`, { defaultValue: "" }) || fallback
}

export function HistoryScreen() {
  const { t } = useTranslation()
  const [onlySameCaliber, setOnlySameCaliber] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const sessionsQuery = useQuery({ queryKey: ["interview", "sessions"], queryFn: () => listInterviewSessions() })
  const records = useMemo(
    () => (sessionsQuery.data ?? []).filter((record) => record.hasReport),
    [sessionsQuery.data],
  )

  const comparableCalibers = useMemo(() => {
    const sizes: Record<string, number> = {}
    for (const record of records) sizes[caliberOf(record)] = (sizes[caliberOf(record)] ?? 0) + 1
    return new Set(Object.entries(sizes).filter(([, size]) => size >= 2).map(([key]) => key))
  }, [records])

  // 数据到位后默认选最近两条同口径记录，直接展示「同口径连线趋势」主态。
  useEffect(() => {
    if (selectedIds.length > 0 || records.length < 2) return
    const first = records[0]
    const partner = records.find((record) => record.id !== first.id && caliberOf(record) === caliberOf(first))
    setSelectedIds(partner ? [partner.id, first.id] : [records[1].id, first.id])
  }, [records, selectedIds.length])

  const visibleRecords = onlySameCaliber
    ? records.filter((record) => comparableCalibers.has(caliberOf(record)))
    : records

  const selected = selectedIds
    .map((id) => records.find((record) => record.id === id))
    .filter((record): record is InterviewSessionSummary => record !== undefined)

  const ordered = selected.length === 2 ? [...selected].sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []
  const [earlier, later] = ordered

  const comparisonQuery = useQuery({
    queryKey: ["interview", "comparison", selectedIds[0] ?? "", selectedIds[1] ?? ""],
    queryFn: () => getInterviewComparison(selectedIds[0]!, selectedIds[1]!),
    enabled: selectedIds.length === 2,
  })
  const comparison = comparisonQuery.data
  const connectable = comparison?.connectable ?? false
  const comparisonScores = (session: InterviewComparisonSession) => scoreMap(session.scores)

  function toggleRecord(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id)
      if (prev.length < 2) return [...prev, id]
      return [prev[1], id]
    })
  }

  function toggleCaliberFilter() {
    const next = !onlySameCaliber
    setOnlySameCaliber(next)
    if (next) {
      setSelectedIds((current) =>
        current.filter((id) => {
          const record = records.find((item) => item.id === id)
          return record !== undefined && comparableCalibers.has(caliberOf(record))
        }),
      )
    }
  }

  function compositionText(record: InterviewSessionSummary) {
    const entries = Object.entries(record.questionKinds)
    if (entries.length === 0) return ""
    return entries.map(([kind, count]) => t("interviewHistory.questionTypes." + kind, { defaultValue: kind }) + " " + count).join(" · ")
  }

  return (
    <div className="flex flex-col">
      <SectionHeader
        eyebrow={t("interviewHistory.header.eyebrow")}
        title={t("interviewHistory.header.title")}
        description={t("interviewHistory.header.description")}
        actions={
          <button
            type="button"
            role="switch"
            aria-checked={onlySameCaliber}
            onClick={toggleCaliberFilter}
            className={
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
              (onlySameCaliber ? "border-cobalt bg-cobalt/10 text-cobalt" : "border-border bg-card text-muted-foreground hover:bg-accent")
            }
          >
            <span
              aria-hidden
              className={"relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors " + (onlySameCaliber ? "bg-cobalt" : "bg-muted")}
            >
              <span className={"absolute size-3 rounded-full bg-background transition-transform " + (onlySameCaliber ? "translate-x-3.5" : "translate-x-0.5")} />
            </span>
            {t("interviewHistory.header.sameCaliberToggle")}
          </button>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] items-stretch gap-5">
        <Panel title={t("interviewHistory.list.title")} caption={t("interviewHistory.list.caption")} className="flex flex-col">
          {onlySameCaliber ? (
            <p className="mt-3 rounded-lg border border-cobalt/40 bg-cobalt/5 px-3 py-2 text-xs text-cobalt">
              {t("interviewHistory.list.filteredNotice")}
            </p>
          ) : null}

          <div className="mt-3 flex flex-1 flex-col gap-2">
            {sessionsQuery.isPending ? (
              <p className="text-xs text-muted-foreground">{t("interviewHistory.list.loading")}</p>
            ) : sessionsQuery.isError ? (
              <p className="rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">
                {errorText(sessionsQuery.error, t)}
              </p>
            ) : visibleRecords.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-secondary px-3 py-6 text-center">
                <p className="text-sm font-medium text-foreground">
                  {onlySameCaliber ? t("interviewHistory.list.filteredEmpty") : t("interviewHistory.list.empty")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("interviewHistory.list.filteredEmptyHint")}</p>
              </div>
            ) : (
              visibleRecords.map((record) => {
                const isSelected = selectedIds.includes(record.id)
                return (
                  <button
                    key={record.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleRecord(record.id)}
                    className={
                      "w-full rounded-lg border p-3 text-left transition-colors " +
                      (isSelected ? "border-cobalt bg-cobalt/5" : "border-border bg-secondary hover:bg-accent")
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={
                          "inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold " +
                          (isSelected ? "border-cobalt bg-cobalt text-background" : "border-border text-transparent")
                        }
                      >
                        {isSelected ? selectedIds.indexOf(record.id) + 1 : 0}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(record.createdAt)}</span>
                      <span className="truncate text-xs font-medium text-foreground">{record.role}</span>
                      <span className="ml-auto shrink-0 text-base font-semibold text-cobalt">
                        {record.averageScore ?? t("interviewHistory.list.noScore")}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {record.rubricVersion}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{compositionText(record)}</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </Panel>

        <Panel title={t("interviewHistory.compare.title")} caption={t("interviewHistory.compare.caption")} className="flex flex-col">
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("interviewHistory.list.selectedCount", { selected: selected.length })}
            </span>
            {selected.map((record) => (
              <span key={record.id} className="inline-flex items-center gap-1.5 rounded-md border border-cobalt/40 bg-cobalt/5 px-2 py-0.5 text-xs text-cobalt">
                {formatDate(record.createdAt)} · {record.role} · {record.rubricVersion}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              disabled={selected.length === 0}
              className="ml-auto rounded-lg border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("interviewHistory.compare.clear")}
            </button>
          </div>

          {selected.length === 0 ? (
            <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary px-6 py-12 text-center">
              <p className="text-sm font-semibold text-foreground">{t("interviewHistory.compare.emptyTitle")}</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t("interviewHistory.compare.emptyBody")}</p>
            </div>
          ) : null}

          {selected.length === 1 && selected[0] !== undefined ? (
            <div className="mt-4 flex flex-col gap-3">
              <div className="rounded-xl border border-border bg-secondary p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{formatDate(selected[0].createdAt)}</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                      {selected[0].role} · {selected[0].rubricVersion}
                    </p>
                  </div>
                  <span className="shrink-0 text-2xl font-semibold text-cobalt">
                    {selected[0].averageScore ?? t("interviewHistory.list.noScore")}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{compositionText(selected[0])}</p>
              </div>
              <p className="rounded-lg border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground">
                {t("interviewHistory.compare.oneSelectedTitle")}：{t("interviewHistory.compare.oneSelectedBody")}
              </p>
            </div>
          ) : null}

          {selected.length === 2 && comparisonQuery.isPending ? (
            <p className="mt-4 text-xs text-muted-foreground">{t("interviewHistory.compare.loading")}</p>
          ) : null}
          {selected.length === 2 && comparisonQuery.isError ? (
            <p className="mt-4 rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs text-coral">
              {errorText(comparisonQuery.error, t)}
            </p>
          ) : null}

          {comparison && connectable && earlier !== undefined && later !== undefined ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cobalt/40 bg-cobalt/5 px-2.5 py-0.5 text-xs font-medium text-cobalt">
                  {t("interviewHistory.compare.sameCaliberTag")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(earlier.createdAt)} → {formatDate(later.createdAt)}
                </span>
              </div>

              <div className="rounded-xl border border-border bg-secondary p-3">
                <svg viewBox="0 0 560 220" className="h-52 w-full" role="img" aria-label={t("interviewHistory.compare.trendChartLabel")}>
                  {TREND_TICKS.map((tick) => (
                    <g key={tick}>
                      <line x1={TREND.left} y1={trendY(tick)} x2={TREND.right} y2={trendY(tick)} className="text-border" stroke="currentColor" strokeWidth={1} strokeDasharray="4 4" />
                      <text x={TREND.left - 10} y={trendY(tick) + 4} textAnchor="end" className="text-muted-foreground" fill="currentColor" fontSize={11}>
                        {tick}
                      </text>
                    </g>
                  ))}
                  <line x1={TREND.left} y1={TREND.bottom} x2={TREND.right} y2={TREND.bottom} className="text-border" stroke="currentColor" strokeWidth={1.5} />
                  <text x={20} y={100} transform="rotate(-90 20 100)" textAnchor="middle" className="text-muted-foreground" fill="currentColor" fontSize={11}>
                    {t("interviewHistory.compare.scoreUnit")}
                  </text>
                  <line x1={TREND_X_EARLIER} y1={trendY(comparison.a.average ?? 0)} x2={TREND_X_LATER} y2={trendY(comparison.b.average ?? 0)} className="text-cobalt" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
                  {[
                    { x: TREND_X_EARLIER, session: comparison.a, tagKey: "interviewHistory.compare.earlier" },
                    { x: TREND_X_LATER, session: comparison.b, tagKey: "interviewHistory.compare.later" },
                  ].map((point) => (
                    <g key={point.session.id}>
                      <line x1={point.x} y1={trendY(point.session.average ?? 0)} x2={point.x} y2={TREND.bottom} className="text-muted-foreground" stroke="currentColor" strokeWidth={1} strokeDasharray="4 4" />
                      <circle cx={point.x} cy={trendY(point.session.average ?? 0)} r={5} className="text-cobalt" fill="currentColor" />
                      <text x={point.x} y={trendY(point.session.average ?? 0) - 12} textAnchor="middle" className="text-cobalt" fill="currentColor" fontSize={16} fontWeight={600}>
                        {point.session.average ?? "-"}
                      </text>
                      <text x={point.x} y={TREND.bottom + 20} textAnchor="middle" className="text-muted-foreground" fill="currentColor" fontSize={11}>
                        {formatDate(point.session.createdAt)}
                      </text>
                      <text x={point.x} y={TREND.bottom + 38} textAnchor="middle" className="text-foreground" fill="currentColor" fontSize={11} fontWeight={600}>
                        {t(point.tagKey)}
                      </text>
                    </g>
                  ))}
                </svg>
                <p className="mt-1 text-right text-xs text-muted-foreground">{t("interviewHistory.compare.sourceNote")}</p>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{t("interviewHistory.compare.deltaTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("interviewHistory.compare.deltaCaption")}</p>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-2">
                  {DIMENSION_KEYS.map((dimensionKey) => {
                    const before = comparisonScores(comparison.a)[dimensionKey]
                    const after = comparisonScores(comparison.b)[dimensionKey]
                    const delta = (after ?? 0) - (before ?? 0)
                    const meta = deltaMeta(delta)
                    return (
                      <li key={dimensionKey} className="rounded-lg border border-border bg-secondary px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">
                            {t("interviewHistory.dimensions." + dimensionKey)}
                          </span>
                          <span title={t(meta.labelKey)} className={"inline-flex shrink-0 items-center gap-1 text-xs font-semibold " + meta.className}>
                            <span aria-hidden>{meta.arrow}</span>
                            {(delta > 0 ? "+" : "") + delta}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{before ?? "-"}</span>
                          <span aria-hidden className="text-border">→</span>
                          <span className="font-semibold text-foreground">{after ?? "-"}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          ) : null}

          {comparison && !connectable && earlier !== undefined && later !== undefined ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="rounded-xl border border-coral bg-coral/10 p-3">
                <div className="flex items-start gap-2">
                  <span aria-hidden className="text-sm text-coral">⚠</span>
                  <p className="text-sm font-medium text-coral">{t("interviewHistory.compare.mismatchNotice")}</p>
                </div>
                <p className="mt-1 pl-6 text-xs text-foreground">{t("interviewHistory.compare.reasons." + comparison.reason)}</p>
              </div>

              <div className="rounded-xl border border-border bg-secondary p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-coral/50 bg-coral/10 px-2.5 py-0.5 text-xs font-medium text-coral">
                    {t("interviewHistory.compare.differentCaliberTag")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(earlier.createdAt)} · {formatDate(later.createdAt)}
                  </span>
                </div>
                <svg viewBox="0 0 300 220" className="mx-auto mt-2 block h-52 w-auto" role="img" aria-label={t("interviewHistory.compare.barsChartLabel")}>
                  <line x1={24} y1={BARS.baseline} x2={276} y2={BARS.baseline} className="text-border" stroke="currentColor" strokeWidth={1.5} />
                  {[
                    { session: comparison.a, role: comparison.a.role, rubric: comparison.a.rubricVersion },
                    { session: comparison.b, role: comparison.b.role, rubric: comparison.b.rubricVersion },
                  ].map((entry, index) => {
                    const x = BARS.xs[index] ?? BARS.xs[0] ?? 48
                    const height = barHeight(entry.session.average ?? 0)
                    return (
                      <g key={entry.session.id}>
                        <rect x={x} y={BARS.baseline - height} width={BARS.width} height={height} rx={6} className={index === 0 ? "text-cobalt" : "text-gold"} fill="currentColor" />
                        <text x={x + BARS.width / 2} y={BARS.baseline - height - 10} textAnchor="middle" className="text-foreground" fill="currentColor" fontSize={16} fontWeight={600}>
                          {entry.session.average ?? "-"}
                        </text>
                        <text x={x + BARS.width / 2} y={BARS.baseline + 20} textAnchor="middle" className="text-muted-foreground" fill="currentColor" fontSize={11}>
                          {formatDate(entry.session.createdAt)}
                        </text>
                        <text x={x + BARS.width / 2} y={BARS.baseline + 38} textAnchor="middle" className="text-foreground" fill="currentColor" fontSize={11} fontWeight={600}>
                          {entry.rubric}
                        </text>
                        <text x={x + BARS.width / 2} y={BARS.baseline + 54} textAnchor="middle" className="text-muted-foreground" fill="currentColor" fontSize={10}>
                          {entry.role}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  )
}

export default HistoryScreen
