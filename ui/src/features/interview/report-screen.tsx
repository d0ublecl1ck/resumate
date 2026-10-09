// 屏幕：单场评估报告（Storybook 先行；数据为文件内常量，不发网络请求）。
// 三条硬约束：逐维度附证据、证据不足不给分、量表版本随报告冻结。
// 交互：内容维度行点击展开证据原文；「不适用」徽标点击展开说明；顶部切换纯文本 / 语音场次。
import { useState } from "react"
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

/** 冻结量表 v1.0 的内容维度结果；分数固定，供评审截图复现。 */
const CONTENT_ROWS: { id: "correctness" | "depth" | "rigor" | "fit"; score: number }[] = [
  { id: "correctness", score: 82 },
  { id: "depth", score: 75 },
  { id: "rigor", score: 77 },
  { id: "fit", score: 88 },
]

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

type SessionMode = "text" | "voice"

export function InterviewReportScreen() {
  const { t } = useTranslation()
  const expression = "interviewReport.expression."
  const [sessionMode, setSessionMode] = useState<SessionMode>("text")
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set())
  const [explainOpen, setExplainOpen] = useState<Set<string>>(new Set())

  function switchMode(mode: SessionMode) {
    setSessionMode(mode)
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

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow={t("interviewReport.eyebrow")}
        title={t("interviewReport.title", { role: t("interviewReport.role") })}
        description={t("interviewReport.description")}
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
              {t("interviewReport.actions.rubricVersion", { version: RUBRIC_VERSION })}
              <span className="text-muted-foreground">· {t("interviewReport.actions.rubricFrozen")}</span>
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="size-4" aria-hidden />
              {t("interviewReport.actions.export")}
            </button>
          </>
        }
      />

      <div className="grid grid-cols-5 gap-5">
        {/* 左栏 3/5：内容维度（行可点击展开证据原文）+ 表达维度（随场次切换） */}
        <div className="col-span-3 space-y-5">
          <Panel title={t("interviewReport.content.title")} caption={t("interviewReport.content.caption")}>
            <ul className="mt-3 divide-y divide-border">
              {CONTENT_ROWS.map((row) => {
                const dimension = t("interviewReport.content.dims." + row.id)
                const expanded = expandedEvidence.has(row.id)
                return (
                  <li
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => toggleEvidence(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        toggleEvidence(row.id)
                      }
                    }}
                    className="grid cursor-pointer grid-cols-[10rem_1fr] gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{dimension}</span>
                        <span className="font-serif text-2xl font-bold leading-none text-cobalt">{row.score}</span>
                      </div>
                      <div
                        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label={t("interviewReport.content.scoreAria", { dimension, score: row.score })}
                        aria-valuenow={row.score}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div className="h-full rounded-full bg-cobalt" style={{ width: row.score + "%" }} />
                      </div>
                    </div>
                    <div className="min-w-0 border-l border-border pl-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground">
                          <Quote className="size-3" aria-hidden />
                          {t("interviewReport.content.evidenceLabel")}
                        </p>
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
                      </div>
                      <p className="wrap-anywhere mt-1 text-xs leading-5 text-secondary-foreground">
                        {t("interviewReport.content.evidence." + row.id)}
                      </p>
                      {expanded ? (
                        <p className="wrap-anywhere mt-2 rounded-lg border-l-2 border-cobalt bg-muted/50 px-3 py-1.5 text-xs leading-5 text-secondary-foreground">
                          {t("interviewReport.content.evidenceMore." + row.id)}
                        </p>
                      ) : null}
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
                const measured = voice || isConfidence
                const explanationOpen = explainOpen.has(id)
                let caption = t(expression + "confidenceBasis")
                if (!isConfidence) {
                  caption = voice
                    ? t(expression + (id === "pace" ? "voiceBasisPace" : "voiceBasisClarity"))
                    : t(expression + "audioReference", {
                        value: t(expression + (id === "pace" ? "paceNormal" : "clarityGood")),
                      })
                }
                let badge = t(expression + "confidenceEstimate")
                if (!isConfidence) {
                  badge = voice
                    ? t(expression + (id === "pace" ? "voiceValuePace" : "voiceValueClarity"))
                    : t(expression + "notApplicable")
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
                          title={t(expression + "notApplicableDetail." + id)}
                          onClick={() => toggleExplain(id)}
                          className="shrink-0 rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-cobalt/40 hover:text-cobalt"
                        >
                          {badge}
                        </button>
                      )}
                    </div>
                    {explanationOpen ? (
                      <p className="mx-3 mb-2 rounded-lg border-l-2 border-gold bg-secondary px-3 py-1.5 text-xs leading-5 text-secondary-foreground">
                        {t(expression + "notApplicableDetail." + id)}
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
            <ul className="mt-3 space-y-2">
              {HIGHLIGHTS.map((id) => (
                <li key={id} className="flex gap-2 text-sm leading-5 text-secondary-foreground">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden />
                  <span className="wrap-anywhere">{t("interviewReport.highlights.items." + id)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={t("interviewReport.gaps.title")} caption={t("interviewReport.gaps.caption")}>
            <ul className="mt-3 space-y-2">
              {GAPS.map((id) => (
                <li key={id} className="flex gap-2 text-sm leading-5 text-secondary-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-coral" aria-hidden />
                  <span className="wrap-anywhere">{t("interviewReport.gaps.items." + id)}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title={t("interviewReport.suggestions.title")} caption={t("interviewReport.suggestions.caption")}>
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
          </Panel>
        </div>
      </div>
    </div>
  )
}
