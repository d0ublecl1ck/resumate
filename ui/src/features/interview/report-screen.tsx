// 屏幕：单场评估报告（Storybook 先行；受控模式传入真实 report 与语音指标）。
// 三条硬约束：逐维度附证据、证据不足不给分、量表版本随报告冻结。
// 交互：内容维度行点击展开证据原文；「不适用」徽标点击展开说明；顶部切换纯文本 / 语音场次。
// 无 report / speech 入参时回退到文件内设计样例，供 Storybook 预览设计稿。
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  Download,
  Info,
  Lightbulb,
  Quote,
  Snowflake,
} from "lucide-react"
import { Panel, SectionHeader } from "@/features/interview/section-header"
import { ApiRequestError } from "@/lib/api-client"
import { exportInterviewReportMarkdown } from "@/lib/interview"
import type { InterviewReportDimension, InterviewReportView } from "@/lib/interview"
import type { ExpressionSummary } from "@/lib/speech-metrics"

/** 冻结量表 v1.0 的内容维度结果；分数固定，供评审截图复现。 */
const CONTENT_ROWS: { id: InterviewReportDimension; score: number }[] = [
  { id: "correctness", score: 82 },
  { id: "depth", score: 75 },
  { id: "rigor", score: 77 },
  { id: "fit", score: 88 },
]

const DIMENSIONS: InterviewReportDimension[] = ["correctness", "depth", "rigor", "fit"]

/** 表达维度：纯文本场次下语速与清晰度不可测量，切到语音场次后给出实测值。 */
const EXPRESSION_ROWS: ("pace" | "clarity" | "confidence")[] = ["pace", "clarity", "confidence"]

const HIGHLIGHTS = ["jmm", "index", "aop"] as const
const GAPS = ["depth", "fit", "vague"] as const
const SUGGESTIONS: { id: "gc" | "star" | "numbers"; item: string }[] = [
  { id: "gc", item: "14-2" },
  { id: "star", item: "14-3" },
  { id: "numbers", item: "14-4" },
]

const RUBRIC_VERSION = "v1.0"
// 本岗语速参考区间，只作为对照上下文展示，不是本场实测结果。
const PACE_BAND_MIN = 110
const PACE_BAND_MAX = 140

type SessionMode = "text" | "voice"

/** 统一内容维度行：设计态证据走 i18n 键，真实态证据是后端回答原话。 */
type ContentRow = {
  id: InterviewReportDimension
  value: number | null
  evidence: string[]
  design: boolean
}

export interface InterviewReportScreenProps {
  /** 本场真实评估报告。传入时内容维度、亮点 / 不足 / 建议都来自真实数据。 */
  report?: InterviewReportView | null
  /** 本场真实岗位名；不传时用设计样例岗位。 */
  role?: string
  /**
   * 本场真实语音指标汇总。传入时表达维度只显示实测值或「不适用」；
   * 不传（Storybook 设计预览）才使用文件内的设计态示例。
   */
  speech?: ExpressionSummary | null
}

export function InterviewReportScreen({ report, role, speech }: InterviewReportScreenProps = {}) {
  const { t } = useTranslation()
  const expression = "interviewReport.expression."
  const realContent = report != null
  const realExpression = realContent || speech !== undefined
  const [requestedMode, setRequestedMode] = useState<SessionMode | null>(null)
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set())
  const [explainOpen, setExplainOpen] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const contentRows = useMemo<ContentRow[]>(() => {
    if (!report) {
      return CONTENT_ROWS.map((row) => ({ id: row.id, value: row.score, evidence: [], design: true }))
    }
    const scored = new Map(report.contentScores.map((item) => [item.dimension, item]))
    return DIMENSIONS.map((dimension) => {
      const score = scored.get(dimension)
      return {
        id: dimension,
        value: score?.score ?? null,
        evidence: score?.evidence ?? [],
        design: false,
      }
    })
  }, [report])

  // 真实数据到场时由数据决定默认场次类型（有音频 -> 语音），用户仍可切回对照。
  const derivedMode: SessionMode = realExpression && speech?.hasAudio ? "voice" : "text"
  const sessionMode = requestedMode ?? derivedMode

  function switchMode(mode: SessionMode) {
    setRequestedMode(mode)
    setExplainOpen(new Set())
  }

  function toggleEvidence(id: string) {
    setExpandedEvidence((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleExplain(id: string) {
    setExplainOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const rubricVersion = report?.rubricVersion ?? RUBRIC_VERSION
  // 自信度的「依据处数」用真实报告里有证据的维度数，设计态回退到 2。
  const confidenceCount = report ? report.contentScores.filter((score) => score.evidence.length > 0).length : 2
  const highlights = report ? report.highlights : []
  const gaps = report ? report.gaps : []
  const suggestions = report ? report.suggestions : []
  const sessionId = report?.sessionId ?? null

  /** 导出失败按机器错误码映射 i18n 文案；未知错误走 generic，绝不直出服务端 message。 */
  function exportErrorMessage(cause: unknown): string {
    if (cause instanceof ApiRequestError) {
      if (cause.code === "RESOURCE_NOT_FOUND") return t("interviewReport.export.errors.missing")
      if (cause.code === "FORBIDDEN" || cause.code === "UNAUTHENTICATED")
        return t("interviewReport.export.errors.permission")
      if (cause.code === "NETWORK_ERROR") return t("interviewReport.export.errors.network")
    }
    return t("interviewReport.export.errors.generic")
  }

  async function handleExport() {
    if (!sessionId || exporting) return
    setExporting(true)
    setExportNotice(null)
    setExportError(null)
    try {
      const markdown = await exportInterviewReportMarkdown(sessionId)
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = t("interviewReport.export.fileName", { role: role ?? t("interviewReport.role") })
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setExportNotice(t("interviewReport.export.success"))
    } catch (cause) {
      setExportError(exportErrorMessage(cause))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow={t("interviewReport.eyebrow")}
        title={t("interviewReport.title", { role: role ?? t("interviewReport.role") })}
        description={t("interviewReport.description", { version: rubricVersion })}
        actions={
          <>
            <div
              role="group"
              aria-label={t("interviewReport.mode.label")}
              className="inline-flex rounded-lg border border-border bg-muted p-1"
            >
              {(["text", "voice"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={sessionMode === mode}
                  onClick={() => switchMode(mode)}
                  className={
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                    (sessionMode === mode
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {t("interviewReport.mode." + mode)}
                </button>
              ))}
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground">
              <Snowflake className="size-3.5 text-cobalt" aria-hidden />
              {t("interviewReport.actions.rubricVersion", { version: rubricVersion })}
              <span className="text-muted-foreground">· {t("interviewReport.actions.rubricFrozen")}</span>
            </span>
            <button
              type="button"
              disabled={!sessionId || exporting}
              onClick={() => void handleExport()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="size-4" aria-hidden />
              {exporting ? t("interviewReport.export.exporting") : t("interviewReport.actions.export")}
            </button>
          </>
        }
      />

      {exportNotice ? (
        <p role="status" className="rounded-lg border border-cobalt/40 bg-cobalt/5 px-3 py-2 text-xs font-medium text-cobalt">
          {exportNotice}
        </p>
      ) : null}
      {exportError ? (
        <p role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-3 py-2 text-xs font-medium text-coral">
          {exportError}
        </p>
      ) : null}

      <div className="grid grid-cols-5 gap-5">
        {/* 左栏 3/5：总体摘要 + 内容维度（行可点击展开证据原文）+ 表达维度（随场次切换） */}
        <div className="col-span-3 space-y-5">
          {realContent && report?.summary ? (
            <Panel title={t("interviewReport.summary.title")}>
              <p className="wrap-anywhere mt-3 text-sm leading-6 text-secondary-foreground">{report.summary}</p>
            </Panel>
          ) : null}

          <Panel title={t("interviewReport.content.title")} caption={t("interviewReport.content.caption")}>
            <ul className="mt-3 divide-y divide-border">
              {contentRows.map((row) => {
                const dimension = t("interviewReport.content.dims." + row.id)
                const canExpand = row.design || row.evidence.length > 1
                const expanded = canExpand && expandedEvidence.has(row.id)
                return (
                  <li
                    key={row.id}
                    role={canExpand ? "button" : undefined}
                    tabIndex={canExpand ? 0 : undefined}
                    aria-expanded={canExpand ? expanded : undefined}
                    onClick={canExpand ? () => toggleEvidence(row.id) : undefined}
                    onKeyDown={
                      canExpand
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              toggleEvidence(row.id)
                            }
                          }
                        : undefined
                    }
                    className={
                      "grid grid-cols-[10rem_1fr] gap-4 py-3 first:pt-0 last:pb-0 " +
                      (canExpand ? "cursor-pointer" : "")
                    }
                  >
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{dimension}</span>
                        {row.value === null ? (
                          <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {t("interviewReport.content.insufficientEvidence")}
                          </span>
                        ) : (
                          <span className="font-serif text-2xl font-bold leading-none text-cobalt">{row.value}</span>
                        )}
                      </div>
                      {row.value === null ? null : (
                        <div
                          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-label={t("interviewReport.content.scoreAria", { dimension, score: row.value })}
                          aria-valuenow={row.value}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div className="h-full rounded-full bg-cobalt" style={{ width: row.value + "%" }} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 border-l border-border pl-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground">
                          <Quote className="size-3" aria-hidden />
                          {t("interviewReport.content.evidenceLabel")}
                        </p>
                        {canExpand ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-cobalt">
                            {t(
                              expanded
                                ? "interviewReport.content.collapse"
                                : "interviewReport.content.expand",
                            )}
                            <ChevronDown
                              className={"size-3 transition-transform " + (expanded ? "rotate-180" : "")}
                              aria-hidden
                            />
                          </span>
                        ) : null}
                      </div>
                      {row.design ? (
                        <>
                          <p className="wrap-anywhere mt-1 text-xs leading-5 text-secondary-foreground">
                            {t("interviewReport.content.evidence." + row.id)}
                          </p>
                          {expanded ? (
                            <p className="wrap-anywhere mt-2 rounded-lg border-l-2 border-cobalt bg-muted/50 px-3 py-1.5 text-xs leading-5 text-secondary-foreground">
                              {t("interviewReport.content.evidenceMore." + row.id)}
                            </p>
                          ) : null}
                        </>
                      ) : row.evidence.length === 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("interviewReport.content.noEvidence")}
                        </p>
                      ) : expanded ? (
                        <ul className="mt-2 space-y-1">
                          {row.evidence.map((item, index) => (
                            <li
                              key={index + "-" + item}
                              className="wrap-anywhere rounded-lg border-l-2 border-cobalt bg-muted/50 px-3 py-1.5 text-xs leading-5 text-secondary-foreground"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="wrap-anywhere mt-1 text-xs leading-5 text-secondary-foreground">
                          {row.evidence[0]}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>

          <Panel title={t("interviewReport.expression.title")} caption={t("interviewReport.expression.caption")}>
            <ul className="mt-3 space-y-2">
              {EXPRESSION_ROWS.map((id) => {
                const voice = sessionMode === "voice"
                const isConfidence = id === "confidence"
                const explanationOpen = explainOpen.has(id)

                let measured: boolean
                let badge: string
                let caption: string
                let detail: string

                if (isConfidence) {
                  // 自信度没有足够信号支撑，永远只给「有依据的估计」，不声称音频实测。
                  measured = true
                  badge = t(expression + "confidenceEstimate")
                  caption = t(expression + "confidenceBasis", { count: confidenceCount })
                  detail = ""
                } else if (voice && realExpression) {
                  // 真实模式：只有服务端算出的实测值或「不适用」，没有设计态示例。
                  const pace = speech?.paceCharsPerMin ?? null
                  const level = speech?.clarityLevel ?? null
                  if (id === "pace") {
                    measured = pace !== null
                    badge = measured ? t(expression + "realPaceValue", { value: pace }) : t(expression + "notApplicable")
                    caption = measured
                      ? t(expression + "realPaceBasis", { value: pace, min: PACE_BAND_MIN, max: PACE_BAND_MAX })
                      : t(expression + "audioReference", { value: t(expression + "paceNormal") })
                  } else {
                    measured = level !== null
                    badge = measured
                      ? t(expression + "clarityLevels." + (level ?? "good"))
                      : t(expression + "notApplicable")
                    caption = measured
                      ? t(expression + "realClarityBasis", {
                          fillers: speech?.fillerCount ?? 0,
                          pauses: speech?.pauseCount ?? 0,
                        })
                      : t(expression + "audioReference", { value: t(expression + "clarityGood") })
                  }
                  detail = t(expression + "realNoTranscript")
                } else if (voice) {
                  // 设计预览态：保留 Storybook 定稿示例，仅供评审截图。
                  measured = true
                  badge = t(expression + (id === "pace" ? "voiceValuePace" : "voiceValueClarity"))
                  caption = t(expression + (id === "pace" ? "voiceBasisPace" : "voiceBasisClarity"))
                  detail = ""
                } else {
                  measured = false
                  badge = t(expression + "notApplicable")
                  caption = t(expression + "audioReference", {
                    value: t(expression + (id === "pace" ? "paceNormal" : "clarityGood")),
                  })
                  detail = t(expression + "notApplicableDetail." + id)
                }

                return (
                  <li key={id} className="rounded-lg border border-border bg-muted/40">
                    <div className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{t(expression + "metrics." + id)}</p>
                        <p className="text-xs text-muted-foreground">{caption}</p>
                      </div>
                      {measured ? (
                        <span className="shrink-0 rounded-md border border-cobalt/40 bg-cobalt/5 px-2 py-0.5 text-xs font-medium text-cobalt">
                          {badge}
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-expanded={explanationOpen}
                          title={detail}
                          onClick={() => toggleExplain(id)}
                          className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-cobalt/40 hover:text-cobalt"
                        >
                          {badge}
                        </button>
                      )}
                    </div>
                    {!measured && explanationOpen ? (
                      <p className="mx-3 mb-2 rounded-lg border-l-2 border-gold bg-secondary px-3 py-1.5 text-xs leading-5 text-secondary-foreground">
                        {detail}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {sessionMode === "text" ? (
              <>
                <p className="mt-3 flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
                  {t(expression + "textOnlyNote")}
                </p>
                <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                  {t(expression + "insufficientNote")}
                </p>
              </>
            ) : (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
                {t(expression + "voiceNote")}
              </p>
            )}
          </Panel>
        </div>

        {/* 右栏 2/5：亮点 / 不足 / 改进建议 */}
        <div className="col-span-2 space-y-5">
          <Panel title={t("interviewReport.highlights.title")} caption={t("interviewReport.highlights.caption")}>
            {realContent ? (
              <ul className="mt-3 space-y-2">
                {highlights.length === 0 ? (
                  <li className="text-xs text-muted-foreground">{t("interviewReport.empty")}</li>
                ) : (
                  highlights.map((item, index) => (
                    <li key={index + "-" + item} className="flex gap-2 text-sm leading-5 text-secondary-foreground">
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden />
                      <span className="wrap-anywhere">{item}</span>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <ul className="mt-3 space-y-2">
                {HIGHLIGHTS.map((id) => (
                  <li key={id} className="flex gap-2 text-sm leading-5 text-secondary-foreground">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden />
                    <span className="wrap-anywhere">{t("interviewReport.highlights.items." + id)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("interviewReport.gaps.title")} caption={t("interviewReport.gaps.caption")}>
            {realContent ? (
              <ul className="mt-3 space-y-2">
                {gaps.length === 0 ? (
                  <li className="text-xs text-muted-foreground">{t("interviewReport.empty")}</li>
                ) : (
                  gaps.map((item, index) => (
                    <li key={index + "-" + item} className="flex gap-2 text-sm leading-5 text-secondary-foreground">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-coral" aria-hidden />
                      <span className="wrap-anywhere">{item}</span>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <ul className="mt-3 space-y-2">
                {GAPS.map((id) => (
                  <li key={id} className="flex gap-2 text-sm leading-5 text-secondary-foreground">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-coral" aria-hidden />
                    <span className="wrap-anywhere">{t("interviewReport.gaps.items." + id)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={t("interviewReport.suggestions.title")} caption={t("interviewReport.suggestions.caption")}>
            {realContent ? (
              <ul className="mt-3 space-y-2">
                {suggestions.length === 0 ? (
                  <li className="text-xs text-muted-foreground">{t("interviewReport.empty")}</li>
                ) : (
                  suggestions.map((item, index) => (
                    <li key={index + "-" + item} className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm leading-5 text-secondary-foreground">
                      <Lightbulb className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden />
                      <span className="wrap-anywhere">{item}</span>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <ul className="mt-3 space-y-2">
                {SUGGESTIONS.map((s) => (
                  <li key={s.id} className="rounded-lg border border-border bg-muted/40 p-3">
                    <span className="inline-flex items-center gap-1 rounded-md bg-cobalt/10 px-2 py-0.5 text-[11px] font-medium text-cobalt">
                      <Lightbulb className="size-3" aria-hidden />
                      {t("interviewReport.suggestions.practiceItem", { item: s.item })}
                    </span>
                    <p className="mt-1.5 text-sm leading-5 text-secondary-foreground">
                      {t("interviewReport.suggestions.items." + s.id)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
