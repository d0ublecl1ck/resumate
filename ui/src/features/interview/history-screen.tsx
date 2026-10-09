// 面试历史与口径比较（US-14.5）：左侧历史记录多选，右侧按口径给出「连线趋势」或「并列柱」两种对比态。
// 数据全部为文件内 mock，交互由 useState 本地状态驱动，不发任何网络请求。
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Panel, SectionHeader } from "./section-header"

type QuestionTypeCount = { key: string; count: number }
type DimensionScore = { key: string; value: number }

type InterviewRecord = {
  id: string
  date: string
  roleKey: string
  scaleKey: string
  score: number
  composition: QuestionTypeCount[]
  dimensions: DimensionScore[]
}

// 六条历史：r1/r2 为「后端 · 量表 v3.2」同岗位同量表；r3、r6 分别为另一量表版本；
// r4/r5 为「产品 · 量表 v3.2」，用来验证开关过滤后仍保留可对比的同口径组。
const RECORDS: InterviewRecord[] = [
  {
    id: "r1",
    date: "2026-09-28",
    roleKey: "backend",
    scaleKey: "v32",
    score: 84,
    composition: [
      { key: "basics", count: 8 },
      { key: "systemDesign", count: 6 },
      { key: "behavior", count: 4 },
    ],
    dimensions: [
      { key: "knowledge", value: 84 },
      { key: "structure", value: 86 },
      { key: "pace", value: 79 },
      { key: "communication", value: 87 },
    ],
  },
  {
    id: "r2",
    date: "2026-09-14",
    roleKey: "backend",
    scaleKey: "v32",
    score: 79,
    composition: [
      { key: "basics", count: 7 },
      { key: "systemDesign", count: 6 },
      { key: "behavior", count: 5 },
    ],
    dimensions: [
      { key: "knowledge", value: 76 },
      { key: "structure", value: 80 },
      { key: "pace", value: 82 },
      { key: "communication", value: 78 },
    ],
  },
  {
    id: "r3",
    date: "2026-08-30",
    roleKey: "backend",
    scaleKey: "v28",
    score: 74,
    composition: [
      { key: "basics", count: 10 },
      { key: "behavior", count: 6 },
    ],
    dimensions: [
      { key: "knowledge", value: 70 },
      { key: "structure", value: 76 },
      { key: "pace", value: 74 },
      { key: "communication", value: 76 },
    ],
  },
  {
    id: "r4",
    date: "2026-08-16",
    roleKey: "product",
    scaleKey: "v32",
    score: 82,
    composition: [
      { key: "caseStudy", count: 5 },
      { key: "behavior", count: 7 },
      { key: "systemDesign", count: 4 },
    ],
    dimensions: [
      { key: "knowledge", value: 80 },
      { key: "structure", value: 79 },
      { key: "pace", value: 85 },
      { key: "communication", value: 84 },
    ],
  },
  {
    id: "r5",
    date: "2026-08-02",
    roleKey: "product",
    scaleKey: "v32",
    score: 77,
    composition: [
      { key: "caseStudy", count: 4 },
      { key: "behavior", count: 8 },
      { key: "systemDesign", count: 4 },
    ],
    dimensions: [
      { key: "knowledge", value: 74 },
      { key: "structure", value: 75 },
      { key: "pace", value: 80 },
      { key: "communication", value: 79 },
    ],
  },
  {
    id: "r6",
    date: "2026-07-19",
    roleKey: "product",
    scaleKey: "v28",
    score: 71,
    composition: [
      { key: "caseStudy", count: 6 },
      { key: "behavior", count: 6 },
    ],
    dimensions: [
      { key: "knowledge", value: 68 },
      { key: "structure", value: 72 },
      { key: "pace", value: 73 },
      { key: "communication", value: 71 },
    ],
  },
]

const DIMENSION_KEYS = ["knowledge", "structure", "pace", "communication"]

/** 口径 = 岗位 + 量表版本；两者都一致才允许连线。 */
function caliberOf(record: InterviewRecord): string {
  return record.roleKey + "|" + record.scaleKey
}

const CALIBER_SIZES = RECORDS.reduce<Record<string, number>>((sizes, record) => {
  const key = caliberOf(record)
  sizes[key] = (sizes[key] ?? 0) + 1
  return sizes
}, {})

/** 只有成组（同一口径至少两条）的记录才值得进入「仅看同岗位同量表」视图。 */
const COMPARABLE_CALIBERS = new Set(
  Object.entries(CALIBER_SIZES)
    .filter(([, size]) => size >= 2)
    .map(([key]) => key),
)

// 趋势折线几何：纵轴按 60–100 的相对刻度绘制。
const TREND = { left: 64, right: 520, top: 24, bottom: 176, min: 60, max: 100 }
const TREND_TICKS = [60, 70, 80, 90, 100]
const TREND_X_EARLIER = 200
const TREND_X_LATER = 384

function trendY(value: number): number {
  const ratio = (value - TREND.min) / (TREND.max - TREND.min)
  return TREND.bottom - ratio * (TREND.bottom - TREND.top)
}

// 并列柱几何：不与任何折线相连。
const BARS = { baseline: 168, maxHeight: 128, width: 64, xs: [48, 188], min: 60, max: 100 }

function barHeight(score: number): number {
  const ratio = (score - BARS.min) / (BARS.max - BARS.min)
  return Math.round(ratio * BARS.maxHeight)
}

function deltaMeta(delta: number): { arrow: string; className: string; labelKey: string } {
  if (delta > 0) {
    return { arrow: "↑", className: "text-cobalt", labelKey: "interviewHistory.compare.deltaUp" }
  }
  if (delta < 0) {
    return { arrow: "↓", className: "text-coral", labelKey: "interviewHistory.compare.deltaDown" }
  }
  return { arrow: "→", className: "text-muted-foreground", labelKey: "interviewHistory.compare.deltaFlat" }
}

export function HistoryScreen() {
  const { t } = useTranslation()
  const [onlySameCaliber, setOnlySameCaliber] = useState(false)
  // 默认选中 r2 -> r1，直接展示「同口径连线趋势」这一主态。
  const [selectedIds, setSelectedIds] = useState<string[]>(["r2", "r1"])

  const visibleRecords = onlySameCaliber
    ? RECORDS.filter((record) => COMPARABLE_CALIBERS.has(caliberOf(record)))
    : RECORDS

  const selected = selectedIds
    .map((id) => RECORDS.find((record) => record.id === id))
    .filter((record): record is InterviewRecord => record !== undefined)

  const ordered = selected.length === 2 ? [...selected].sort((a, b) => a.date.localeCompare(b.date)) : []
  const earlier = ordered[0]
  const later = ordered[1]
  const isSameCaliber = earlier !== undefined && later !== undefined && caliberOf(earlier) === caliberOf(later)

  function toggleRecord(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((value) => value !== id)
      if (prev.length < 2) return [...prev, id]
      // 已选满两条时，新点选替换较早的一条，保持「最多两条」。
      return [prev[1], id]
    })
  }

  function clearSelection() {
    setSelectedIds([])
  }

  function toggleCaliberFilter() {
    const next = !onlySameCaliber
    setOnlySameCaliber(next)
    if (next) {
      // 过滤后不可见的记录必须同步取消选中，避免右侧展示已经不在列表里的记录。
      setSelectedIds((current) =>
        current.filter((id) => {
          const record = RECORDS.find((item) => item.id === id)
          return record !== undefined && COMPARABLE_CALIBERS.has(caliberOf(record))
        }),
      )
    }
  }

  function roleName(record: InterviewRecord) {
    return t("interviewHistory.roles." + record.roleKey)
  }

  function scaleName(record: InterviewRecord) {
    return t("interviewHistory.scales." + record.scaleKey)
  }

  function compositionText(record: InterviewRecord) {
    return record.composition
      .map((item) => t("interviewHistory.questionTypes." + item.key) + " " + item.count)
      .join(" · ")
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
              (onlySameCaliber
                ? "border-cobalt bg-cobalt/10 text-cobalt"
                : "border-border bg-card text-muted-foreground hover:bg-accent")
            }
          >
            <span
              aria-hidden
              className={
                "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors " +
                (onlySameCaliber ? "bg-cobalt" : "bg-muted")
              }
            >
              <span
                className={
                  "absolute size-3 rounded-full bg-background transition-transform " +
                  (onlySameCaliber ? "translate-x-3.5" : "translate-x-0.5")
                }
              />
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
            {visibleRecords.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-secondary px-3 py-6 text-center">
                <p className="text-sm font-medium text-foreground">{t("interviewHistory.list.filteredEmpty")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("interviewHistory.list.filteredEmptyHint")}</p>
              </div>
            ) : null}

            {visibleRecords.map((record) => {
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
                        (isSelected
                          ? "border-cobalt bg-cobalt text-background"
                          : "border-border text-transparent")
                      }
                    >
                      {isSelected ? selectedIds.indexOf(record.id) + 1 : 0}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{record.date}</span>
                    <span className="truncate text-xs font-medium text-foreground">{roleName(record)}</span>
                    <span className="ml-auto shrink-0 text-base font-semibold text-cobalt">{record.score}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {scaleName(record)}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{compositionText(record)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </Panel>

        <Panel title={t("interviewHistory.compare.title")} caption={t("interviewHistory.compare.caption")} className="flex flex-col">
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("interviewHistory.list.selectedCount", { selected: selected.length })}
            </span>
            {selected.map((record) => (
              <span
                key={record.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-cobalt/40 bg-cobalt/5 px-2 py-0.5 text-xs text-cobalt"
              >
                {record.date} · {roleName(record)} · {scaleName(record)}
              </span>
            ))}
            <button
              type="button"
              onClick={clearSelection}
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
                    <p className="text-xs text-muted-foreground">{selected[0].date}</p>
                    <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                      {roleName(selected[0])} · {scaleName(selected[0])}
                    </p>
                  </div>
                  <span className="shrink-0 text-2xl font-semibold text-cobalt">{selected[0].score}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{compositionText(selected[0])}</p>
              </div>
              <p className="rounded-lg border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground">
                {t("interviewHistory.compare.oneSelectedTitle")}：{t("interviewHistory.compare.oneSelectedBody")}
              </p>
            </div>
          ) : null}

          {isSameCaliber && earlier !== undefined && later !== undefined ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cobalt/40 bg-cobalt/5 px-2.5 py-0.5 text-xs font-medium text-cobalt">
                  {t("interviewHistory.compare.sameCaliberTag")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {earlier.date} → {later.date}
                </span>
              </div>

              <div className="rounded-xl border border-border bg-secondary p-3">
                <svg
                  viewBox="0 0 560 220"
                  className="h-52 w-full"
                  role="img"
                  aria-label={t("interviewHistory.compare.trendChartLabel")}
                >
                  {TREND_TICKS.map((tick) => (
                    <g key={tick}>
                      <line
                        x1={TREND.left}
                        y1={trendY(tick)}
                        x2={TREND.right}
                        y2={trendY(tick)}
                        className="text-border"
                        stroke="currentColor"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                      />
                      <text
                        x={TREND.left - 10}
                        y={trendY(tick) + 4}
                        textAnchor="end"
                        className="text-muted-foreground"
                        fill="currentColor"
                        fontSize={12}
                      >
                        {tick}
                      </text>
                    </g>
                  ))}
                  <line
                    x1={TREND.left}
                    y1={TREND.bottom}
                    x2={TREND.right}
                    y2={TREND.bottom}
                    className="text-border"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  />
                  <text
                    x={20}
                    y={100}
                    transform="rotate(-90 20 100)"
                    textAnchor="middle"
                    className="text-muted-foreground"
                    fill="currentColor"
                    fontSize={12}
                  >
                    {t("interviewHistory.compare.scoreUnit")}
                  </text>

                  {/* 同口径才连成的一条折线。 */}
                  <line
                    x1={TREND_X_EARLIER}
                    y1={trendY(earlier.score)}
                    x2={TREND_X_LATER}
                    y2={trendY(later.score)}
                    className="text-cobalt"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  {[
                    { x: TREND_X_EARLIER, record: earlier, tagKey: "interviewHistory.compare.earlier" },
                    { x: TREND_X_LATER, record: later, tagKey: "interviewHistory.compare.later" },
                  ].map((point) => (
                    <g key={point.record.id}>
                      <line
                        x1={point.x}
                        y1={trendY(point.record.score)}
                        x2={point.x}
                        y2={TREND.bottom}
                        className="text-muted-foreground"
                        stroke="currentColor"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                      />
                      <circle cx={point.x} cy={trendY(point.record.score)} r={5} className="text-cobalt" fill="currentColor" />
                      <text
                        x={point.x}
                        y={trendY(point.record.score) - 12}
                        textAnchor="middle"
                        className="text-cobalt"
                        fill="currentColor"
                        fontSize={16}
                        fontWeight={600}
                      >
                        {point.record.score}
                      </text>
                      <text
                        x={point.x}
                        y={TREND.bottom + 20}
                        textAnchor="middle"
                        className="text-muted-foreground"
                        fill="currentColor"
                        fontSize={12}
                      >
                        {point.record.date}
                      </text>
                      <text
                        x={point.x}
                        y={TREND.bottom + 38}
                        textAnchor="middle"
                        className="text-foreground"
                        fill="currentColor"
                        fontSize={12}
                        fontWeight={600}
                      >
                        {t(point.tagKey)}
                      </text>
                    </g>
                  ))}
                </svg>
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  {t("interviewHistory.compare.sourceNote")}
                </p>
              </div>

              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{t("interviewHistory.compare.deltaTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("interviewHistory.compare.deltaCaption")}</p>
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-2">
                  {DIMENSION_KEYS.map((dimensionKey) => {
                    const before = earlier.dimensions.find((item) => item.key === dimensionKey)?.value ?? 0
                    const after = later.dimensions.find((item) => item.key === dimensionKey)?.value ?? 0
                    const delta = after - before
                    const meta = deltaMeta(delta)
                    return (
                      <li key={dimensionKey} className="rounded-lg border border-border bg-secondary px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">
                            {t("interviewHistory.dimensions." + dimensionKey)}
                          </span>
                          <span
                            title={t(meta.labelKey)}
                            className={"inline-flex shrink-0 items-center gap-1 text-xs font-semibold " + meta.className}
                          >
                            <span aria-hidden>{meta.arrow}</span>
                            {(delta > 0 ? "+" : "") + delta}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{before}</span>
                          <span aria-hidden className="text-border">
                            →
                          </span>
                          <span className="font-semibold text-foreground">{after}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          ) : null}

          {selected.length === 2 && !isSameCaliber && earlier !== undefined && later !== undefined ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="rounded-xl border border-coral bg-coral/10 p-3">
                <div className="flex items-start gap-2">
                  <span aria-hidden className="text-sm text-coral">
                    ⚠
                  </span>
                  <p className="text-sm font-medium text-coral">{t("interviewHistory.compare.mismatchNotice")}</p>
                </div>
                <p className="mt-1 pl-6 text-xs text-foreground">{t("interviewHistory.compare.mismatchHint")}</p>
              </div>

              <div className="rounded-xl border border-border bg-secondary p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-coral/50 bg-coral/10 px-2.5 py-0.5 text-xs font-medium text-coral">
                    {t("interviewHistory.compare.differentCaliberTag")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {earlier.date} · {later.date}
                  </span>
                </div>
                <svg
                  viewBox="0 0 300 220"
                  className="mx-auto mt-2 block h-52 w-auto"
                  role="img"
                  aria-label={t("interviewHistory.compare.barsChartLabel")}
                >
                  <line
                    x1={24}
                    y1={BARS.baseline}
                    x2={276}
                    y2={BARS.baseline}
                    className="text-border"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  />
                  <line
                    x1={150}
                    y1={30}
                    x2={150}
                    y2={BARS.baseline}
                    className="text-border"
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  {[earlier, later].map((record, index) => {
                    const x = BARS.xs[index] ?? BARS.xs[0] ?? 48
                    const height = barHeight(record.score)
                    const barClass = index === 0 ? "text-cobalt" : "text-gold"
                    return (
                      <g key={record.id}>
                        <rect
                          x={x}
                          y={BARS.baseline - height}
                          width={BARS.width}
                          height={height}
                          rx={6}
                          className={barClass}
                          fill="currentColor"
                        />
                        <text
                          x={x + BARS.width / 2}
                          y={BARS.baseline - height - 10}
                          textAnchor="middle"
                          className="text-foreground"
                          fill="currentColor"
                          fontSize={16}
                          fontWeight={600}
                        >
                          {record.score}
                        </text>
                        <text
                          x={x + BARS.width / 2}
                          y={BARS.baseline + 20}
                          textAnchor="middle"
                          className="text-muted-foreground"
                          fill="currentColor"
                          fontSize={12}
                        >
                          {record.date}
                        </text>
                        <text
                          x={x + BARS.width / 2}
                          y={BARS.baseline + 38}
                          textAnchor="middle"
                          className="text-foreground"
                          fill="currentColor"
                          fontSize={12}
                          fontWeight={600}
                        >
                          {scaleName(record)}
                        </text>
                        <text
                          x={x + BARS.width / 2}
                          y={BARS.baseline + 54}
                          textAnchor="middle"
                          className="text-muted-foreground"
                          fill="currentColor"
                          fontSize={11}
                        >
                          {roleName(record)}
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
