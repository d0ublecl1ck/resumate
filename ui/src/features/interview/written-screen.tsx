// Epic 14 · US-14.8 岗位笔试练习（接真实 /quiz 接口）。
// 三种题型（客观题 / 开放题 / 代码题）在同一屏内作答：抽题、提交判分、查看解析都走服务端；
// 客观题答案键不下发，代码题只提交文本给后端做静态评审，前端不执行任何用户代码。
// 界面文案走 interviewWritten 命名空间；错误码映射到 i18n，不直出服务端 message。

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { z } from "zod"
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
  Loader2,
  PenLine,
  RotateCcw,
  Send,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react"

import { Panel, SectionHeader } from "@/features/interview/section-header"
import { userFacingError } from "@/lib/api-error-text"
import {
  createQuizAttempt,
  submitQuizAnswer,
  submitQuizAttempt,
  type QuizAnswer,
  type QuizAttempt,
  type QuizGroup,
  type QuizQuestion,
} from "@/lib/quiz-api"

const startSchema = z.object({ role: z.string().trim().min(1) })
type StartValues = z.infer<typeof startSchema>

const TAB_ICONS: Record<QuizGroup, typeof ListChecks> = {
  objective: ListChecks,
  open: PenLine,
  code: Code2,
}

const FIELD_CLASS =
  "w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

/** 统一失败出口：VALIDATION_FAILED 允许展示后端校验文案，其余一律映射到本命名空间 i18n。 */
function ErrorNotice({ title, cause }: { title: string; cause: unknown }) {
  const { t } = useTranslation()
  const fallback = t("interviewWritten.errors.generic")
  const { message, code } = userFacingError(cause, fallback)
  const text =
    code === "VALIDATION_FAILED" || !code
      ? message
      : t("interviewWritten.errors." + code, { defaultValue: "" }) || fallback
  return (
    <div role="alert" className="mt-4 rounded-lg border border-coral/40 bg-coral/5 px-4 py-3">
      <p className="text-sm font-medium text-coral">{title}</p>
      <p className="mt-1 text-sm text-secondary-foreground">{text}</p>
      {code === "MODEL_NOT_CONFIGURED" ? (
        <Link
          to="/settings"
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Settings className="size-3.5" aria-hidden />
          {t("interviewWritten.errors.openSettings")}
        </Link>
      ) : null}
    </div>
  )
}

/** 判分要点列表（亮点 / 不足 / 建议 / 问题共用）。 */
function FeedbackList({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <>
      <h3 className="mt-3 text-sm font-semibold text-card-foreground">{title}</h3>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

export function WrittenScreen() {
  const { t } = useTranslation()

  const [attempt, setAttempt] = useState<QuizAttempt | null>(null)
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({})
  const [tab, setTab] = useState<QuizGroup>("objective")
  const [selected, setSelected] = useState<string[]>([])
  const [openAnswer, setOpenAnswer] = useState("")
  const [code, setCode] = useState("")
  const [emptyWarning, setEmptyWarning] = useState(false)
  const [openReference, setOpenReference] = useState(false)
  const [codeReference, setCodeReference] = useState(false)

  const startForm = useForm<StartValues>({
    resolver: zodResolver(startSchema),
    defaultValues: { role: "" },
  })

  const create = useMutation({
    mutationFn: (values: StartValues) => createQuizAttempt({ role: values.role.trim() }),
    onSuccess: (data) => {
      setAttempt(data)
      setAnswers({})
      setSelected([])
      setOpenAnswer("")
      setOpenReference(false)
      setCodeReference(false)
      setEmptyWarning(false)
      setCode(data.questions.find((question) => question.group === "code")?.starterCode ?? "")
      setTab(data.questions[0]?.group ?? "objective")
    },
  })

  const grade = useMutation({
    mutationFn: (input: { questionId: string; selectedOptionIds?: string[]; textAnswer?: string; codeAnswer?: string }) =>
      submitQuizAnswer(attempt?.id ?? "", input),
    onSuccess: ({ answer }) => {
      setAnswers((prev) => ({ ...prev, [answer.questionId]: answer }))
      setEmptyWarning(false)
    },
  })

  const finalize = useMutation({
    mutationFn: () => submitQuizAttempt(attempt?.id ?? ""),
    onSuccess: (data) => {
      setAttempt(data)
      const map: Record<string, QuizAnswer> = {}
      for (const answer of data.answers) map[answer.questionId] = answer
      setAnswers(map)
    },
  })

  const submitted = attempt?.status === "submitted"
  const groups: QuizGroup[] = attempt?.questionTypes.length ? attempt.questionTypes : ["objective", "open", "code"]
  const question = attempt?.questions.find((item) => item.group === tab) ?? null
  const graded = question ? answers[question.id] : undefined
  const answeredCount = attempt ? attempt.questions.filter((item) => answers[item.id]).length : 0

  function toggleOption(optionId: string) {
    if (graded || submitted) return
    setEmptyWarning(false)
    setSelected((prev) => (prev.includes(optionId) ? prev.filter((item) => item !== optionId) : [...prev, optionId]))
  }

  function submitObjective(current: QuizQuestion) {
    if (selected.length === 0) {
      setEmptyWarning(true)
      return
    }
    grade.mutate({ questionId: current.id, selectedOptionIds: selected })
  }

  function submitOpen(current: QuizQuestion) {
    if (openAnswer.trim().length < 10) {
      setEmptyWarning(true)
      return
    }
    grade.mutate({ questionId: current.id, textAnswer: openAnswer.trim() })
  }

  function submitCode(current: QuizQuestion) {
    if (code.trim().length < 8) {
      setEmptyWarning(true)
      return
    }
    grade.mutate({ questionId: current.id, codeAnswer: code })
  }

  function resetObjective() {
    setSelected([])
    setEmptyWarning(false)
    if (question) {
      setAnswers((prev) => {
        const next = { ...prev }
        delete next[question.id]
        return next
      })
    }
  }

  const dimensionLabel = (dimension: string) =>
    t("interviewWritten.dimension." + dimension, { defaultValue: dimension })

  return (
    <div className="flex flex-col">
      <SectionHeader
        eyebrow={t("interviewWritten.eyebrow")}
        title={t("interviewWritten.title")}
        description={t("interviewWritten.description")}
      />

      {!attempt ? (
        <Panel title={t("interviewWritten.start.title")} caption={t("interviewWritten.start.caption")}>
          <label htmlFor="written-role" className="mt-3 block text-xs font-medium text-muted-foreground">
            {t("interviewWritten.start.roleLabel")}
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="written-role"
              type="text"
              className={FIELD_CLASS}
              placeholder={t("interviewWritten.start.rolePlaceholder")}
              {...startForm.register("role")}
            />
            <button
              type="button"
              disabled={create.isPending}
              onClick={startForm.handleSubmit((values) => create.mutate(values))}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-cobalt px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
            >
              {create.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {create.isPending ? t("interviewWritten.start.starting") : t("interviewWritten.start.submit")}
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("interviewWritten.start.hint")}</p>
          {startForm.formState.errors.role ? (
            <p role="alert" className="mt-2 text-xs font-medium text-coral">
              {t("interviewWritten.start.roleRequired")}
            </p>
          ) : null}
          {create.isError ? <ErrorNotice title={t("interviewWritten.start.errorTitle")} cause={create.error} /> : null}
        </Panel>
      ) : (
        <>
          {/* 题目来源与版本：展示当前题型的真实来源 */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
            <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <BookOpenCheck className="size-4 shrink-0 text-cobalt" aria-hidden />
              <span className="shrink-0">{t("interviewWritten.source.label")}</span>
              <span className="truncate font-medium text-card-foreground">
                {question ? question.source.label : attempt.role}
              </span>
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {t("interviewWritten.source.roleLabel")} {attempt.role}
              </span>
              {question ? (
                <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {t("interviewWritten.source.versionLabel")} {question.source.version}
                </span>
              ) : null}
            </div>
          </div>

          {/* 题型 tab：只展示本次抽到的题型 */}
          <div
            role="tablist"
            aria-label={t("interviewWritten.tabs.label")}
            className="mb-4 inline-flex w-fit rounded-lg border border-border bg-muted p-1"
          >
            {groups.map((group) => {
              const Icon = TAB_ICONS[group]
              const active = tab === group
              return (
                <button
                  key={group}
                  type="button"
                  role="tab"
                  id={"written-tab-" + group}
                  aria-selected={active}
                  aria-controls={"written-panel-" + group}
                  onClick={() => {
                    setTab(group)
                    setEmptyWarning(false)
                  }}
                  className={
                    "inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium transition " +
                    (active ? "bg-card text-cobalt shadow-sm" : "text-muted-foreground hover:text-foreground")
                  }
                >
                  <Icon className="size-4" aria-hidden />
                  {t("interviewWritten.tabs." + group)}
                </button>
              )
            })}
          </div>

          {question ? (
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
                        {t("interviewWritten.kind." + question.kind)}
                      </span>
                      <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {t("interviewWritten.objective.points", { n: question.points })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("interviewWritten.objective.selectedCount", { n: selected.length })}
                      </span>
                    </div>
                    <p className="mt-3 text-base font-medium leading-7 text-card-foreground">{question.prompt}</p>
                    <ul className="mt-4 flex flex-col gap-2.5">
                      {question.options.map((option) => {
                        const chosen = selected.includes(option.id)
                        const analysis = (graded?.feedback.optionAnalysis ?? []).find((item) => item.optionId === option.id)
                        const correct = analysis?.correct ?? false
                        const tone = !graded
                          ? chosen
                            ? "border-cobalt bg-cobalt/5"
                            : "border-border bg-background hover:bg-muted"
                          : correct
                            ? "border-cobalt bg-cobalt/5"
                            : chosen
                              ? "border-coral bg-coral/5"
                              : "border-border bg-background"
                        return (
                          <li key={option.id}>
                            <button
                              type="button"
                              onClick={() => toggleOption(option.id)}
                              aria-pressed={chosen}
                              disabled={Boolean(graded) || submitted}
                              className={"flex w-full items-start gap-3 rounded-lg border px-3.5 py-2.5 text-left transition " + tone}
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
                                <span className="mr-1.5 font-semibold">{option.id.toUpperCase()}</span>
                                {option.text}
                              </span>
                              {graded && correct ? (
                                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-cobalt/40 bg-cobalt/5 px-2 py-0.5 text-xs font-medium text-cobalt">
                                  <CircleCheck className="size-3.5" aria-hidden />
                                  {t("interviewWritten.objective.correctBadge")}
                                </span>
                              ) : null}
                              {graded && !correct && chosen ? (
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
                    {!graded ? (
                      <div className="mt-3">
                        <p className="text-sm leading-6 text-muted-foreground">{t("interviewWritten.objective.selectHint")}</p>
                        {emptyWarning ? (
                          <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-coral bg-coral/5 px-3 py-2 text-sm font-medium text-coral">
                            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                            {t("interviewWritten.objective.submitEmpty")}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          disabled={grade.isPending || submitted}
                          onClick={() => submitObjective(question)}
                          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cobalt px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
                        >
                          <CircleCheck className="size-4" aria-hidden />
                          {grade.isPending ? t("interviewWritten.objective.submitting") : t("interviewWritten.objective.submit")}
                        </button>
                        {grade.isError ? <ErrorNotice title={t("interviewWritten.errors.generic")} cause={grade.error} /> : null}
                      </div>
                    ) : (
                      <div className="mt-3">
                        <div className="rounded-lg border border-border bg-muted px-4 py-3">
                          <p className="text-xs text-muted-foreground">{t("interviewWritten.objective.resultTitle")}</p>
                          <p className="mt-1 text-2xl font-semibold leading-none text-cobalt">
                            {t("interviewWritten.objective.score", { score: graded.awardedPoints ?? 0, total: question.points })}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">
                            {t("interviewWritten.objective.verdict." + graded.verdict)}
                          </p>
                        </div>
                        <h3 className="mt-4 text-sm font-semibold text-card-foreground">
                          {t("interviewWritten.objective.analysisTitle")}
                        </h3>
                        <ul className="mt-2 flex flex-col gap-2">
                          {(graded.feedback.optionAnalysis ?? []).map((item) => (
                            <li key={item.optionId} className="flex items-start gap-2 text-xs leading-5">
                              <span
                                className={
                                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border text-[10px] font-semibold " +
                                  (item.correct
                                    ? "border-cobalt/40 bg-cobalt/5 text-cobalt"
                                    : "border-border bg-background text-muted-foreground")
                                }
                              >
                                {item.optionId.toUpperCase()}
                              </span>
                              <span className="text-muted-foreground">{item.explanation}</span>
                            </li>
                          ))}
                        </ul>
                        {graded.feedback.policy ? (
                          <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                            {t("interviewWritten.objective.policyTitle")} {graded.feedback.policy}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          disabled={submitted}
                          onClick={resetObjective}
                          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground disabled:opacity-60"
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
                    <p className="mt-3 text-base font-medium leading-7 text-card-foreground">{question.prompt}</p>
                    <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="written-open-answer">
                      {t("interviewWritten.open.textareaLabel")}
                    </label>
                    <textarea
                      id="written-open-answer"
                      value={openAnswer}
                      disabled={Boolean(graded) || submitted}
                      onChange={(event) => setOpenAnswer(event.target.value)}
                      maxLength={8000}
                      placeholder={t("interviewWritten.open.textareaPlaceholder")}
                      className="mt-2 h-56 w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm leading-6 text-foreground outline-none focus:border-cobalt disabled:opacity-70"
                    />
                    <p className="mt-1.5 text-right text-xs text-muted-foreground">
                      {t("interviewWritten.open.charCount", { n: openAnswer.length, max: 8000 })}
                    </p>
                    {emptyWarning ? (
                      <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-coral bg-coral/5 px-3 py-2 text-sm font-medium text-coral">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {t("interviewWritten.open.submitEmpty")}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={grade.isPending || Boolean(graded) || submitted}
                      onClick={() => submitOpen(question)}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cobalt px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
                    >
                      <CircleCheck className="size-4" aria-hidden />
                      {grade.isPending ? t("interviewWritten.open.submitting") : t("interviewWritten.open.submit")}
                    </button>
                    {grade.isError ? <ErrorNotice title={t("interviewWritten.errors.generic")} cause={grade.error} /> : null}
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
                        {openReference ? t("interviewWritten.open.referenceHide") : t("interviewWritten.open.referenceToggle")}
                      </span>
                      {openReference ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                    </button>
                    {openReference ? (
                      <div className="mt-3 rounded-lg border border-border bg-background p-3.5">
                        {question.referenceAnswer ? (
                          <>
                            <h3 className="text-xs font-semibold text-cobalt">{t("interviewWritten.open.referenceTitle")}</h3>
                            <p className="mt-1.5 text-sm leading-6 text-card-foreground">{question.referenceAnswer}</p>
                          </>
                        ) : null}
                        {question.referencePoints.length > 0 ? (
                          <>
                            <h3 className="mt-3 text-xs font-semibold text-cobalt">{t("interviewWritten.open.rubricTitle")}</h3>
                            <ul className="mt-1.5 flex flex-col gap-1.5">
                              {question.referencePoints.map((point) => (
                                <li key={point} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                                  <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {graded ? (
                      <div className="mt-4">
                        <div className="rounded-lg border border-border bg-muted px-4 py-3">
                          <p className="text-xs text-muted-foreground">{t("interviewWritten.open.resultTitle")}</p>
                          <p className="mt-1 text-2xl font-semibold leading-none text-cobalt">
                            {t("interviewWritten.open.score", { score: graded.awardedPoints ?? 0, total: question.points })}
                          </p>
                          {graded.feedback.summary ? (
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">{graded.feedback.summary}</p>
                          ) : null}
                        </div>
                        <h3 className="mt-4 text-sm font-semibold text-card-foreground">
                          {t("interviewWritten.open.dimensionsTitle")}
                        </h3>
                        <ul className="mt-2 flex flex-col gap-2">
                          {(graded.feedback.dimensions ?? []).map((dimension) => (
                            <li key={dimension.dimension} className="rounded-lg border border-border bg-background px-3 py-2">
                              <div className="flex items-center justify-between gap-2 text-xs font-medium text-card-foreground">
                                <span>{dimensionLabel(dimension.dimension)}</span>
                                <span className="text-cobalt">
                                  {dimension.score === null
                                    ? t("interviewWritten.open.noEvidence")
                                    : t("interviewWritten.open.score", { score: dimension.score, total: 100 })}
                                </span>
                              </div>
                              {dimension.evidence.length > 0 ? (
                                <ul className="mt-1.5 flex flex-col gap-1">
                                  {dimension.evidence.map((item) => (
                                    <li key={item} className="text-xs leading-5 text-muted-foreground">
                                      {t("interviewWritten.open.evidenceTitle")}: {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        <FeedbackList title={t("interviewWritten.open.highlightsTitle")} items={graded.feedback.highlights} />
                        <FeedbackList title={t("interviewWritten.open.gapsTitle")} items={graded.feedback.gaps} />
                        <FeedbackList title={t("interviewWritten.open.suggestionsTitle")} items={graded.feedback.suggestions} />
                      </div>
                    ) : null}
                  </Panel>
                </>
              ) : null}

              {tab === "code" ? (
                <>
                  <Panel title={t("interviewWritten.code.stemTitle")} caption={t("interviewWritten.code.caption")}>
                    <p className="mt-3 text-base font-medium leading-7 text-card-foreground">{question.prompt}</p>
                    <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="written-code-editor">
                      {t("interviewWritten.code.editorLabel")}
                    </label>
                    <textarea
                      id="written-code-editor"
                      value={code}
                      disabled={Boolean(graded) || submitted}
                      onChange={(event) => setCode(event.target.value)}
                      spellCheck={false}
                      className="mt-2 h-64 w-full resize-none rounded-lg border border-input bg-muted px-3.5 py-2.5 font-mono text-xs leading-5 text-foreground outline-none focus:border-cobalt disabled:opacity-70"
                    />
                    {emptyWarning ? (
                      <p role="alert" className="mt-2 flex items-start gap-2 rounded-lg border border-coral bg-coral/5 px-3 py-2 text-sm font-medium text-coral">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {t("interviewWritten.code.submitEmpty")}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={grade.isPending || Boolean(graded) || submitted}
                      onClick={() => submitCode(question)}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cobalt px-4 py-2.5 text-sm font-medium text-background disabled:opacity-60"
                    >
                      <ShieldCheck className="size-4" aria-hidden />
                      {grade.isPending ? t("interviewWritten.code.submitting") : t("interviewWritten.code.submit")}
                    </button>
                    {grade.isError ? <ErrorNotice title={t("interviewWritten.errors.generic")} cause={grade.error} /> : null}
                  </Panel>

                  <Panel title={t("interviewWritten.code.resultTitle")} caption={t("interviewWritten.code.executionNotice")}>
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-cobalt/30 bg-cobalt/5 px-3.5 py-2.5">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden />
                      <p className="text-xs leading-5 text-secondary-foreground">
                        <span className="font-medium text-cobalt">{t("interviewWritten.code.executionNoticeTitle")} </span>
                        {t("interviewWritten.code.executionNotice")}
                      </p>
                    </div>
                    {graded ? (
                      <div className="mt-3">
                        <div className="rounded-lg border border-border bg-muted px-4 py-3">
                          <p className="text-xs text-muted-foreground">{t("interviewWritten.code.resultTitle")}</p>
                          <p className="mt-1 text-2xl font-semibold leading-none text-cobalt">
                            {t("interviewWritten.code.score", { score: graded.awardedPoints ?? 0, total: question.points })}
                          </p>
                          {graded.feedback.summary ? (
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">{graded.feedback.summary}</p>
                          ) : null}
                        </div>
                        <h3 className="mt-4 text-sm font-semibold text-card-foreground">
                          {t("interviewWritten.code.dimensionsTitle")}
                        </h3>
                        <ul className="mt-2 flex flex-col gap-2">
                          {(graded.feedback.dimensions ?? []).map((dimension) => (
                            <li key={dimension.dimension} className="rounded-lg border border-border bg-background px-3 py-2">
                              <div className="flex items-center justify-between gap-2 text-xs font-medium text-card-foreground">
                                <span>{dimensionLabel(dimension.dimension)}</span>
                                <span className="text-cobalt">
                                  {dimension.score === null
                                    ? t("interviewWritten.open.noEvidence")
                                    : t("interviewWritten.open.score", { score: dimension.score, total: 100 })}
                                </span>
                              </div>
                              {dimension.evidence.length > 0 ? (
                                <ul className="mt-1.5 flex flex-col gap-1">
                                  {dimension.evidence.map((item) => (
                                    <li key={item} className="text-xs leading-5 text-muted-foreground">
                                      {t("interviewWritten.code.evidenceTitle")}: {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        <FeedbackList title={t("interviewWritten.code.issuesTitle")} items={graded.feedback.issues} />
                        <FeedbackList title={t("interviewWritten.code.suggestionsTitle")} items={graded.feedback.suggestions} />
                      </div>
                    ) : null}

                    <button
                      type="button"
                      aria-expanded={codeReference}
                      onClick={() => setCodeReference((prev) => !prev)}
                      className="mt-3 inline-flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-secondary px-3.5 py-2.5 text-sm font-medium text-secondary-foreground"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Lightbulb className="size-4 text-cobalt" aria-hidden />
                        {codeReference ? t("interviewWritten.code.referenceHide") : t("interviewWritten.code.referenceToggle")}
                      </span>
                      {codeReference ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                    </button>
                    {codeReference ? (
                      <div className="mt-3 rounded-lg border border-border bg-background p-3.5">
                        {question.referenceAnswer ? (
                          <>
                            <h3 className="text-xs font-semibold text-cobalt">{t("interviewWritten.code.referenceTitle")}</h3>
                            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs leading-5 text-card-foreground">
                              {question.referenceAnswer}
                            </pre>
                          </>
                        ) : null}
                        {question.referencePoints.length > 0 ? (
                          <>
                            <h3 className="mt-3 text-xs font-semibold text-cobalt">{t("interviewWritten.code.rubricTitle")}</h3>
                            <ul className="mt-1.5 flex flex-col gap-1.5">
                              {question.referencePoints.map((point) => (
                                <li key={point} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                                  <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-cobalt" aria-hidden />
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("interviewWritten.code.referenceHint")}</p>
                      </div>
                    ) : null}
                  </Panel>
                </>
              ) : null}
            </div>
          ) : (
            <Panel title={t("interviewWritten.errorTitle")} caption={t("interviewWritten.loading")}>
              <p className="mt-3 text-sm text-muted-foreground">{t("interviewWritten.attempt.resultPending")}</p>
            </Panel>
          )}

          {/* 统一提交：作答后可一次提交看总分 */}
          {attempt.status === "in_progress" ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {t("interviewWritten.attempt.progress", { answered: answeredCount, total: attempt.questions.length })}
              </p>
              <button
                type="button"
                disabled={finalize.isPending}
                onClick={() => finalize.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-cobalt px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
              >
                <Send className="size-4" aria-hidden />
                {finalize.isPending ? t("interviewWritten.attempt.submitting") : t("interviewWritten.attempt.submit")}
              </button>
            </div>
          ) : null}

          {finalize.isError ? <ErrorNotice title={t("interviewWritten.errors.generic")} cause={finalize.error} /> : null}

          {attempt.result ? (
            <div className="mt-4">
              <Panel
                title={t("interviewWritten.attempt.resultTitle")}
                caption={t("interviewWritten.attempt.submittedAt", { date: formatDate(attempt.result.submittedAt) })}
              >
                <p className="mt-3 text-3xl font-semibold leading-none text-cobalt">
                  {t("interviewWritten.attempt.total", { score: attempt.result.totalScore, total: attempt.result.maxScore })}
                </p>
                {attempt.result.policy.objective ? (
                  <div className="mt-3 rounded-lg border border-border bg-background px-3.5 py-3">
                    <h3 className="text-xs font-semibold text-cobalt">{t("interviewWritten.attempt.policyTitle")}</h3>
                    <ul className="mt-1.5 flex flex-col gap-1.5 text-xs leading-5 text-muted-foreground">
                      {attempt.result.policy.objective ? <li>{attempt.result.policy.objective}</li> : null}
                      {attempt.result.policy.open ? <li>{attempt.result.policy.open}</li> : null}
                      {attempt.result.policy.code ? <li>{attempt.result.policy.code}</li> : null}
                    </ul>
                  </div>
                ) : null}
              </Panel>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
