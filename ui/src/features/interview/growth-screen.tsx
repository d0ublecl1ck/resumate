// 练习计划与成长曲线（Epic 14）：左侧练习项，右侧成长曲线。
// 屏幕核心信息是「曲线口径约束」——同一量表才连线，换口径只并列展示。
// 交互：口径切换（同口径 / 全部记录）与练习项「开始复测」标记。
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CircleCheck } from "lucide-react"
import { Panel, SectionHeader } from "./section-header"

type PracticeItem = {
  id: string
  weak: boolean
  titleKey: string
  dimensionKey: string
  goalKey: string
  materialKey: string
  retestKey: string
}

// 练习项均为文件内 mock，不发任何网络请求。
const PRACTICE_ITEMS: PracticeItem[] = [
  {
    id: "knowledge",
    weak: true,
    titleKey: "interviewGrowth.plan.items.knowledge.title",
    dimensionKey: "interviewGrowth.plan.items.knowledge.dimension",
    goalKey: "interviewGrowth.plan.items.knowledge.goal",
    materialKey: "interviewGrowth.plan.items.knowledge.material",
    retestKey: "interviewGrowth.plan.items.knowledge.retest",
  },
  {
    id: "structure",
    weak: false,
    titleKey: "interviewGrowth.plan.items.structure.title",
    dimensionKey: "interviewGrowth.plan.items.structure.dimension",
    goalKey: "interviewGrowth.plan.items.structure.goal",
    materialKey: "interviewGrowth.plan.items.structure.material",
    retestKey: "interviewGrowth.plan.items.structure.retest",
  },
  {
    id: "pace",
    weak: false,
    titleKey: "interviewGrowth.plan.items.pace.title",
    dimensionKey: "interviewGrowth.plan.items.pace.dimension",
    goalKey: "interviewGrowth.plan.items.pace.goal",
    materialKey: "interviewGrowth.plan.items.pace.material",
    retestKey: "interviewGrowth.plan.items.pace.retest",
  },
]

// 曲线几何：纵轴 70–100 的相对刻度；同口径三次，另一口径两次。
const PLOT = { left: 70, right: 520, top: 24, bottom: 240, min: 70, max: 100 }
const Y_TICKS = [70, 80, 90, 100]

function scaleY(value: number) {
  const ratio = (value - PLOT.min) / (PLOT.max - PLOT.min)
  return PLOT.bottom - ratio * (PLOT.bottom - PLOT.top)
}

// 真实场次：同岗位（Java 后端）＋ 同量表（interview-rubric-v1）连续三场，
// 数值为四维平均分，取自本机真实会话记录（见 build/growth-real-sessions.json）。
const SAME_SCALE_POINTS = [
  { id: "first", value: 78, x: 118 },
  { id: "second", value: 88, x: 208 },
  { id: "third", value: 89, x: 298 },
]

const OTHER_SCALE_POINTS = [
  { id: "other1", value: 82, x: 402 },
  { id: "other2", value: 89, x: 492 },
]

const SEPARATOR_X = 352

type Scope = "same" | "all"

export function GrowthScreen() {
  const { t } = useTranslation()
  const [scope, setScope] = useState<Scope>("all")
  const [retested, setRetested] = useState<Set<string>>(new Set())
  const sameLine = SAME_SCALE_POINTS.map((point) => point.x + "," + scaleY(point.value)).join(" ")
  const otherLine = OTHER_SCALE_POINTS.map((point) => point.x + "," + scaleY(point.value)).join(" ")
  const showAll = scope === "all"

  function toggleRetested(id: string) {
    setRetested((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
                    (scope === id
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {t(
                    id === "same"
                      ? "interviewGrowth.header.scopeSame"
                      : "interviewGrowth.header.scopeAll",
                  )}
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
        <Panel
          title={t("interviewGrowth.plan.title")}
          caption={t("interviewGrowth.plan.caption")}
          className="flex flex-col"
        >
          <div className="mt-4 flex flex-1 flex-col gap-3">
            {PRACTICE_ITEMS.map((item) => {
              const done = retested.has(item.id)
              return (
                <article key={item.id} className="rounded-lg border border-border bg-secondary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">{t(item.titleKey)}</h3>
                    <div className="flex shrink-0 items-center gap-2">
                      {done ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-cobalt/40 bg-cobalt/5 px-2 py-0.5 text-xs font-medium text-cobalt">
                          <CircleCheck className="size-3" aria-hidden />
                          {t("interviewGrowth.plan.retested")}
                        </span>
                      ) : null}
                      <span
                        className={
                          item.weak
                            ? "inline-flex items-center gap-1 rounded-md border border-coral bg-coral/10 px-2 py-0.5 text-xs font-medium text-coral"
                            : "inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        }
                      >
                        {item.weak ? t("interviewGrowth.plan.weakTag") + " · " : null}
                        {t(item.dimensionKey)}
                      </span>
                    </div>
                  </div>
                  <dl className="mt-3 space-y-2">
                    <div className="flex gap-3 text-xs">
                      <dt className="w-16 shrink-0 text-muted-foreground">{t("interviewGrowth.plan.rows.goal")}</dt>
                      <dd className="min-w-0 flex-1 font-medium text-foreground">{t(item.goalKey)}</dd>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <dt className="w-16 shrink-0 text-muted-foreground">{t("interviewGrowth.plan.rows.material")}</dt>
                      <dd className="min-w-0 flex-1 text-foreground">{t(item.materialKey)}</dd>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <dt className="w-16 shrink-0 text-muted-foreground">{t("interviewGrowth.plan.rows.retest")}</dt>
                      <dd className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="text-foreground">
                          {done ? t("interviewGrowth.plan.retestDone") : t(item.retestKey)}
                        </span>
                        <button
                          type="button"
                          aria-pressed={done}
                          onClick={() => toggleRetested(item.id)}
                          className={
                            "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors " +
                            (done
                              ? "border-cobalt bg-cobalt/10 text-cobalt"
                              : "border-border bg-card text-cobalt hover:bg-accent")
                          }
                        >
                          {done ? <CircleCheck className="size-3.5" aria-hidden /> : null}
                          {done ? t("interviewGrowth.plan.retested") : t("interviewGrowth.plan.retestAction")}
                        </button>
                      </dd>
                    </div>
                  </dl>
                </article>
              )
            })}
          </div>
        </Panel>

        <Panel
          title={t("interviewGrowth.chart.title")}
          caption={t("interviewGrowth.chart.caption")}
          className="flex flex-col"
        >
          <div className="mt-4 h-80 w-full">
            <svg viewBox="0 0 560 300" className="h-full w-full" role="img" aria-label={t("interviewGrowth.chart.title")}>
              {showAll ? (
                <rect
                  x={SEPARATOR_X}
                  y={PLOT.top}
                  width={PLOT.right - SEPARATOR_X}
                  height={PLOT.bottom - PLOT.top}
                  className="text-muted"
                  fill="currentColor"
                  opacity={0.35}
                />
              ) : null}
              {Y_TICKS.map((tick) => (
                <g key={tick}>
                  <line
                    x1={PLOT.left}
                    y1={scaleY(tick)}
                    x2={PLOT.right}
                    y2={scaleY(tick)}
                    className="text-border"
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                  <text
                    x={PLOT.left - 10}
                    y={scaleY(tick) + 4}
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
                x1={PLOT.left}
                y1={PLOT.bottom}
                x2={PLOT.right}
                y2={PLOT.bottom}
                className="text-border"
                stroke="currentColor"
                strokeWidth={1.5}
              />
              <line
                x1={PLOT.left}
                y1={PLOT.top}
                x2={PLOT.left}
                y2={PLOT.bottom}
                className="text-border"
                stroke="currentColor"
                strokeWidth={1.5}
              />
              <text
                x={18}
                y={132}
                transform="rotate(-90 18 132)"
                textAnchor="middle"
                className="text-muted-foreground"
                fill="currentColor"
                fontSize={12}
              >
                {t("interviewGrowth.chart.yUnit")}
              </text>

              {/* 全部记录：画出另一口径分界线并提示不连线；同口径：提示曲线连续。 */}
              {showAll ? (
                <line
                  x1={SEPARATOR_X}
                  y1={PLOT.top}
                  x2={SEPARATOR_X}
                  y2={PLOT.bottom}
                  className="text-border"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeDasharray="6 5"
                />
              ) : null}
              <text x={SEPARATOR_X + 10} y={46} className="text-foreground" fill="currentColor" fontSize={12} fontWeight={600}>
                {t(showAll ? "interviewGrowth.chart.dividerNoteLine1" : "interviewGrowth.chart.sameScaleNoteLine1")}
              </text>
              <text x={SEPARATOR_X + 10} y={62} className="text-muted-foreground" fill="currentColor" fontSize={12}>
                {t(showAll ? "interviewGrowth.chart.dividerNoteLine2" : "interviewGrowth.chart.sameScaleNoteLine2")}
              </text>

              {/* 同口径：三点一线，用 text-cobalt 主色。 */}
              <polyline
                points={sameLine}
                fill="none"
                className="text-cobalt"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {SAME_SCALE_POINTS.map((point) => (
                <g key={point.id}>
                  <circle cx={point.x} cy={scaleY(point.value)} r={5} className="text-cobalt" fill="currentColor" />
                  <text
                    x={point.x}
                    y={scaleY(point.value) - 12}
                    textAnchor="middle"
                    className="text-cobalt"
                    fill="currentColor"
                    fontSize={14}
                    fontWeight={600}
                  >
                    {point.value}
                  </text>
                </g>
              ))}

              {/* 另一口径：仅在「全部记录」出现，自成一段、虚线与菱形标注，绝不与前段相连。 */}
              {showAll ? (
                <>
                  <polyline
                    points={otherLine}
                    fill="none"
                    className="text-muted-foreground"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeDasharray="6 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {OTHER_SCALE_POINTS.map((point) => (
                    <g key={point.id}>
                      <rect
                        x={point.x - 5}
                        y={scaleY(point.value) - 5}
                        width={10}
                        height={10}
                        transform={"rotate(45 " + point.x + " " + scaleY(point.value) + ")"}
                        className="text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                      />
                      <text
                        x={point.x}
                        y={scaleY(point.value) - 16}
                        textAnchor="middle"
                        className="text-muted-foreground"
                        fill="currentColor"
                        fontSize={13}
                        fontWeight={600}
                      >
                        {point.value}
                      </text>
                    </g>
                  ))}
                </>
              ) : null}

              {/* 横轴刻度：三次同口径；全部记录时补一段另一口径。 */}
              {SAME_SCALE_POINTS.map((point) => (
                <text
                  key={point.id}
                  x={point.x}
                  y={PLOT.bottom + 22}
                  textAnchor="middle"
                  className="text-muted-foreground"
                  fill="currentColor"
                  fontSize={12}
                >
                  {t("interviewGrowth.chart.axis." + point.id)}
                </text>
              ))}
              {showAll ? (
                <text
                  x={(OTHER_SCALE_POINTS[0].x + OTHER_SCALE_POINTS[1].x) / 2}
                  y={PLOT.bottom + 22}
                  textAnchor="middle"
                  className="text-muted-foreground"
                  fill="currentColor"
                  fontSize={12}
                >
                  {t("interviewGrowth.chart.axis.other")}
                </text>
              ) : null}

              <text x={PLOT.right} y={288} textAnchor="end" className="text-muted-foreground" fill="currentColor" fontSize={11}>
                {t("interviewGrowth.chart.sourceNote")}
              </text>
            </svg>
          </div>

          {/* 屏幕最重要的信息：口径约束，用 cobalt 强调；文案随切换口径变化。 */}
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
            {t("interviewGrowth.chart.reading")}
          </p>
        </Panel>
      </div>
    </div>
  )
}

export default GrowthScreen
