// Epic 14 · US-14.8 岗位笔试练习（Storybook 先行屏幕）。
// 三种题型（客观题 / 开放题 / 代码题）在同一屏内切换：勾选、提交判分、折叠展开、运行输出全部为本地状态；
// 题目与代码均为文件内常量 mock，不发起任何网络请求；所有界面文案走 interviewWritten 命名空间。

import { useState, type ComponentType } from "react"
import { useTranslation } from "react-i18next"
import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Code2,
  Lightbulb,
  ListChecks,
  PenLine,
  Play,
  RotateCcw,
  X,
} from "lucide-react"
import { Panel, SectionHeader } from "@/features/interview/section-header"

type TabId = "objective" | "open" | "code"

const TABS: { id: TabId; icon: ComponentType<{ className?: string }> }[] = [
  { id: "objective", icon: ListChecks },
  { id: "open", icon: PenLine },
  { id: "code", icon: Code2 },
]

// 客观题 mock：A/C/D 为正确答案，按「选对得分 − 选错扣分」给部分分。
const OBJECTIVE_OPTIONS = ["a", "b", "c", "d"] as const
type ObjectiveOption = (typeof OBJECTIVE_OPTIONS)[number]
const OBJECTIVE_CORRECT: ObjectiveOption[] = ["a", "c", "d"]
const OBJECTIVE_POINTS = 10

const OPEN_RUBRIC_KEYS = [
  "interviewWritten.open.rubric.order",
  "interviewWritten.open.rubric.tradeoff",
  "interviewWritten.open.rubric.data",
]

// 代码题 mock：编辑区预填待补全实现，参考答案与运行输出为本地常量（用户代码与其执行结果，不做翻译）。
const CODE_TEMPLATE = `type Bucket = { windowStart: number; used: number }

export function limit(bucket: Bucket, now: number, windowMs: number, threshold: number) {
  // TODO: fixed-window counting
  return true
}`

const CODE_REFERENCE = `if (now - bucket.windowStart >= windowMs) {
  bucket.windowStart = now
  bucket.used = 0
}
if (bucket.used >= threshold) return false
bucket.used += 1
return true`

const CODE_OUTPUT = [
  "> run limit()",
  "window=60s  threshold=100",
  "req#001  allowed=true   remaining=99",
  "req#002  allowed=true   remaining=98",
  "req#003  allowed=true   remaining=97",
  "...",
  "req#101  allowed=false  remaining=0",
  "blocked: 1 request(s)",
  "window resets in 42s",
]

export function WrittenScreen() {
  const { t } = useTranslation()

  const [tab, setTab] = useState<TabId>("objective")

  // 客观题状态：勾选、是否已提交、未选提交的提示。
  const [selected, setSelected] = useState<ObjectiveOption[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [emptyWarning, setEmptyWarning] = useState(false)

  // 开放题状态：作答文本与参考答案折叠。
  const [openAnswer, setOpenAnswer] = useState("")
  const [openReference, setOpenReference] = useState(false)

  // 代码题状态：代码、运行输出、运行中与参考答案折叠。
  const [code, setCode] = useState(CODE_TEMPLATE)
  const [codeOutput, setCodeOutput] = useState<string[] | null>(null)
  const [codeRunning, setCodeRunning] = useState(false)
  const [codeReference, setCodeReference] = useState(false)

  const correctPicks = selected.filter((option) => OBJECTIVE_CORRECT.includes(option))
  const wrongPicks = selected.filter((option) => !OBJECTIVE_CORRECT.includes(option))
  const score = Math.max(
    0,
    Math.round(
      (correctPicks.length / OBJECTIVE_CORRECT.length) * OBJECTIVE_POINTS -
        wrongPicks.length * (OBJECTIVE_POINTS / OBJECTIVE_CORRECT.length),
    ),
  )

  function toggleOption(option: ObjectiveOption) {
    if (submitted) return
    setEmptyWarning(false)
    setSelected((prev) => (prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]))
  }

  function submitObjective() {
    if (selected.length === 0) {
      setEmptyWarning(true)
      return
    }
    setEmptyWarning(false)
    setSubmitted(true)
  }

  function resetObjective() {
    setSelected([])
    setSubmitted(false)
    setEmptyWarning(false)
  }

  function runCode() {
    setCodeRunning(true)
    setCodeOutput(null)
    window.setTimeout(() => {
      setCodeOutput(CODE_OUTPUT)
      setCodeRunning(false)
    }, 400)
  }

  function optionTone(option: ObjectiveOption) {
    const chosen = selected.includes(option)
    if (!submitted) {
      return chosen ? "border-cobalt bg-cobalt/5" : "border-border bg-background hover:bg-muted"
    }
    const correct = OBJECTIVE_CORRECT.includes(option)
    if (correct) return "border-cobalt bg-cobalt/5"
    if (chosen) return "border-coral bg-coral/5"
    return "border-border bg-background"
  }

  return (
    <div className="flex flex-col">
      <SectionHeader
        eyebrow={t("interviewWritten.eyebrow")}
        title={t("interviewWritten.title")}
        description={t("interviewWritten.description")}
      />

      {/* 题目来源与版本：三个题型共享的顶部固定信息 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
        <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <BookOpenCheck className="size-4 shrink-0 text-cobalt" aria-hidden />
          <span className="shrink-0">{t("interviewWritten.source.label")}</span>
          <span className="truncate font-medium text-card-foreground">{t("interviewWritten.source.value")}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {t("interviewWritten.source.versionLabel")} {t("interviewWritten.source.version")}
          </span>
          <span className="text-xs text-muted-foreground">{t("interviewWritten.source.updated")}</span>
        </div>
      </div>

      {/* 题型 tab：切换后左右两栏内容同步替换 */}
      <div
        role="tablist"
        aria-label={t("interviewWritten.tabs.label")}
        className="mb-4 inline-flex w-fit rounded-lg border border-border bg-muted p-1"
      >
        {TABS.map(({ id, icon: Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={"written-tab-" + id}
              aria-selected={active}
              aria-controls={"written-panel-" + id}
              onClick={() => setTab(id)}
              className={
                "inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition " +
                (active ? "bg-card text-cobalt shadow-sm" : "text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className="size-4" aria-hidden />
              {t("interviewWritten.tabs." + id)}
            </button>
          )
        })}
      </div>

      <div
        id={"written-panel-" + tab}
        role="tabpanel"
        aria-labelledby={"written-tab-" + tab}
        className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]"
      >
        {tab === "objective" ? (
          <>
            <Panel title={t("interviewWritten.objective.panelTitle")} caption={t("interviewWritten.objective.caption")}>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  <ListChecks className="size-3.5" aria-hidden />
                  {t("interviewWritten.objective.questionTag")}
                </span>
                <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {t("interviewWritten.objective.points", { n: OBJECTIVE_POINTS })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("interviewWritten.objective.selectedCount", { n: selected.length })}
                </span>
              </div>
              <p className="mt-3 text-base font-medium leading-7 text-card-foreground">
                {t("interviewWritten.objective.stem")}
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {OBJECTIVE_OPTIONS.map((option) => {
                  const chosen = selected.includes(option)
                  const correct = OBJECTIVE_CORRECT.includes(option)
                  return (
                    <li key={option}>
                      <button
                        type="button"
                        onClick={() => toggleOption(option)}
                        aria-pressed={chosen}
                        className={
                          "flex w-full items-start gap-3 rounded-lg border px-3.5 py-2.5 text-left transition " +
                          optionTone(option)
                        }
                      >
                        <span
                          className={
                            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border " +
                            (chosen ? "border-cobalt bg-cobalt text-background" : "border-input bg-background")
                          }
                          aria-hidden
                        >
                          {chosen ? <Check className="size-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1 text-sm leading-6 text-card-foreground">
                          <span className="mr-1.5 font-semibold">{option.toUpperCase()}</span>
                          {t("interviewWritten.objective.options." + option + ".text")}
                        </span>
                        {submitted && correct ? (
                          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-cobalt/40 bg-cobalt/5 px-2 py-0.5 text-xs font-medium text-cobalt">
                            <CircleCheck className="size-3.5" aria-hidden />
                            {t("interviewWritten.objective.correctBadge")}
                          </span>
                        ) : null}
                        {submitted && !correct && chosen ? (
                          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-coral bg-coral/5 px-2 py-0.5 text-xs font-medium text-coral">
                            <X className="size-3.5" aria-hidden />
                            {t("interviewWritten.objective.wrongBadge")}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Panel>

            <Panel
              title={t("interviewWritten.objective.answerPanelTitle")}
              caption={t("interviewWritten.objective.answerPanelCaption")}
            >
              {!submitted ? (
                <div className="mt-3">
                  <p className="text-sm leading-6 text-muted-foreground">{t("interviewWritten.objective.selectHint")}</p>
                  {emptyWarning ? (
                    <p
                      role="alert"
                      className="mt-3 flex items-start gap-2 rounded-lg border border-coral bg-coral/5 px-3 py-2 text-sm font-medium text-coral"
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {t("interviewWritten.objective.submitEmpty")}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={submitObjective}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cobalt px-4 py-2.5 text-sm font-medium text-background"
                  >
                    <CircleCheck className="size-4" aria-hidden />
                    {t("interviewWritten.objective.submit")}
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="rounded-lg border border-border bg-muted px-4 py-3">
                    <p className="text-xs text-muted-foreground">{t("interviewWritten.objective.resultTitle")}</p>
                    <p className="mt-1 text-2xl font-semibold leading-none text-cobalt">
                      {t("interviewWritten.objective.score", { score, total: OBJECTIVE_POINTS })}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {score === OBJECTIVE_POINTS
                        ? t("interviewWritten.objective.verdictPerfect")
                        : t("interviewWritten.objective.verdictPartial")}
                    </p>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-card-foreground">
                    {t("interviewWritten.objective.analysisTitle")}
                  </h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {OBJECTIVE_OPTIONS.map((option) => {
                      const correct = OBJECTIVE_CORRECT.includes(option)
                      return (
                        <li key={option} className="flex items-start gap-2 text-xs leading-5">
                          <span
                            className={
                              "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px] font-semibold " +
                              (correct
                                ? "border-cobalt/40 bg-cobalt/5 text-cobalt"
                                : "border-border bg-background text-muted-foreground")
                            }
                          >
                            {option.toUpperCase()}
                          </span>
                          <span className="text-muted-foreground">
                            {t("interviewWritten.objective.optionsAnalysis." + option)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={resetObjective}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground"
                  >
                    <RotateCcw className="size-4" aria-hidden />
                    {t("interviewWritten.objective.reset")}
                  </button>
                </div>
              )}
            </Panel>
          </>
        ) : null}

        {tab === "open" ? (
          <>
            <Panel title={t("interviewWritten.open.stemTitle")} caption={t("interviewWritten.open.caption")}>
              <p className="mt-3 text-base font-medium leading-7 text-card-foreground">
                {t("interviewWritten.open.stem")}
              </p>
              <label
                className="mt-4 block text-xs font-medium text-muted-foreground"
                htmlFor="written-open-answer"
              >
                {t("interviewWritten.open.textareaLabel")}
              </label>
              <textarea
                id="written-open-answer"
                value={openAnswer}
                onChange={(event) => setOpenAnswer(event.target.value)}
                maxLength={500}
                placeholder={t("interviewWritten.open.textareaPlaceholder")}
                className="mt-2 h-56 w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm leading-6 text-foreground outline-none focus:border-cobalt"
              />
              <p className="mt-1.5 text-right text-xs text-muted-foreground">
                {t("interviewWritten.open.charCount", { n: openAnswer.length, max: 500 })}
              </p>
            </Panel>

            <Panel
              title={t("interviewWritten.open.answerPanelTitle")}
              caption={t("interviewWritten.open.answerPanelCaption")}
            >
              <button
                type="button"
                aria-expanded={openReference}
                onClick={() => setOpenReference((prev) => !prev)}
                className="mt-3 inline-flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm font-medium text-secondary-foreground"
              >
                <span className="inline-flex items-center gap-2">
                  <Lightbulb className="size-4 text-cobalt" aria-hidden />
                  {openReference
                    ? t("interviewWritten.open.referenceHide")
                    : t("interviewWritten.open.referenceToggle")}
                </span>
                {openReference ? (
                  <ChevronUp className="size-4" aria-hidden />
                ) : (
                  <ChevronDown className="size-4" aria-hidden />
                )}
              </button>
              {openReference ? (
                <div className="mt-3 rounded-lg border border-border bg-background p-3.5">
                  <h3 className="text-xs font-semibold text-cobalt">{t("interviewWritten.open.referenceTitle")}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-card-foreground">
                    {t("interviewWritten.open.reference")}
                  </p>
                  <h3 className="mt-3 text-xs font-semibold text-cobalt">{t("interviewWritten.open.rubricTitle")}</h3>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {OPEN_RUBRIC_KEYS.map((key) => (
                      <li key={key} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                        <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
                        <span>{t(key)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Panel>
          </>
        ) : null}

        {tab === "code" ? (
          <>
            <Panel title={t("interviewWritten.code.stemTitle")} caption={t("interviewWritten.code.caption")}>
              <p className="mt-3 text-base font-medium leading-7 text-card-foreground">
                {t("interviewWritten.code.stem")}
              </p>
              <div className="mt-4 flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="written-code-editor">
                  {t("interviewWritten.code.editorLabel")}
                </label>
                <button
                  type="button"
                  onClick={runCode}
                  disabled={codeRunning}
                  className="inline-flex items-center gap-2 rounded-lg bg-cobalt px-3.5 py-1.5 text-sm font-medium text-background disabled:opacity-60"
                >
                  <Play className="size-4" aria-hidden />
                  {codeRunning ? t("interviewWritten.code.running") : t("interviewWritten.code.run")}
                </button>
              </div>
              <textarea
                id="written-code-editor"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                spellCheck={false}
                className="mt-2 h-64 w-full resize-none rounded-lg border border-input bg-muted px-3.5 py-2.5 font-mono text-xs leading-5 text-foreground outline-none focus:border-cobalt"
              />
            </Panel>

            <Panel title={t("interviewWritten.code.outputTitle")} caption={t("interviewWritten.code.outputCaption")}>
              <div className="mt-3 rounded-lg border border-border bg-muted p-3.5">
                {codeRunning ? (
                  <p className="text-xs text-muted-foreground">{t("interviewWritten.code.running")}</p>
                ) : codeOutput ? (
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-card-foreground">
                    {codeOutput.join("\n")}
                  </pre>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("interviewWritten.code.outputEmpty")}</p>
                )}
              </div>
              <button
                type="button"
                aria-expanded={codeReference}
                onClick={() => setCodeReference((prev) => !prev)}
                className="mt-3 inline-flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm font-medium text-secondary-foreground"
              >
                <span className="inline-flex items-center gap-2">
                  <Lightbulb className="size-4 text-cobalt" aria-hidden />
                  {codeReference
                    ? t("interviewWritten.code.referenceHide")
                    : t("interviewWritten.code.referenceToggle")}
                </span>
                {codeReference ? (
                  <ChevronUp className="size-4" aria-hidden />
                ) : (
                  <ChevronDown className="size-4" aria-hidden />
                )}
              </button>
              {codeReference ? (
                <div className="mt-3 rounded-lg border border-border bg-background p-3.5">
                  <h3 className="text-xs font-semibold text-cobalt">{t("interviewWritten.code.referenceTitle")}</h3>
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs leading-5 text-card-foreground">
                    {CODE_REFERENCE}
                  </pre>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {t("interviewWritten.code.referenceHint")}
                  </p>
                </div>
              ) : null}
            </Panel>
          </>
        ) : null}
      </div>
    </div>
  )
}
