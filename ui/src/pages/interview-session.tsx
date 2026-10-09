// SCR-015 模拟面试会话（Page）：题面列表 + 逐题作答 + 追问 + 结束生成评估。
// 约束：作答输入用受控原生控件承载，不引入内建表单元素；用户作答与报告正文是后端原话，不做翻译。
import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { AlertTriangle, ArrowLeft, CircleCheck, Lightbulb, Quote, Send, Snowflake } from "lucide-react"

import {
  finishInterviewSession,
  getInterviewReport,
  getInterviewSession,
  submitInterviewAnswer,
} from "@/lib/interview"
import type {
  InterviewQuestionView,
  InterviewReportDimension,
  InterviewReportView,
  InterviewSessionDetail,
} from "@/lib/interview"
import { Panel, SectionHeader } from "@/features/interview/section-header"
import { StateBlock } from "@/components/kit/state-block"
import { InterviewErrorNotice } from "@/pages/interview"

const DIMENSIONS: InterviewReportDimension[] = ["correctness", "depth", "rigor", "fit"]

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-muted-foreground">{label}</dt>
      <dd className="wrap-anywhere mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  )
}

function BulletList({ title, items, icon, tone }: { title: string; items: string[]; icon: "highlight" | "gap" | "suggestion"; tone: "cobalt" | "coral" }) {
  const { t } = useTranslation()
  return (
    <Panel title={title}>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("interviewWorkflow.report.listEmpty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} className="flex gap-2 text-sm leading-5 text-secondary-foreground">
              {icon === "gap" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-coral" aria-hidden />
              ) : icon === "suggestion" ? (
                <Lightbulb className={`mt-0.5 size-4 shrink-0 ${tone === "cobalt" ? "text-cobalt" : "text-coral"}`} aria-hidden />
              ) : (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden />
              )}
              <span className="wrap-anywhere">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ReportPanel({ report }: { report: InterviewReportView }) {
  const { t } = useTranslation()
  const scored = new Map(report.contentScores.map((item) => [item.dimension, item]))

  return (
    <Panel title={t("interviewWorkflow.report.title")} caption={t("interviewWorkflow.report.caption")}>
      <div className="mt-3">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground">
          <Snowflake className="size-3.5 text-cobalt" aria-hidden />
          {t("interviewWorkflow.report.rubricBadge", { version: report.rubricVersion })}
          <span className="text-muted-foreground">· {t("interviewWorkflow.report.rubricFrozen")}</span>
        </span>
      </div>

      {report.summary ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">{t("interviewWorkflow.report.summaryTitle")}</h3>
          <p className="wrap-anywhere mt-1 text-sm leading-6 text-secondary-foreground">{report.summary}</p>
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-foreground">{t("interviewWorkflow.report.dimensionsTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("interviewWorkflow.report.dimensionsCaption")}</p>
        <ul className="mt-3 divide-y divide-border">
          {DIMENSIONS.map((dimension) => {
            const score = scored.get(dimension)
            const value = score?.score ?? null
            const dimensionLabel = t(`interviewWorkflow.report.dims.${dimension}`, { defaultValue: dimension })
            const evidence = score?.evidence ?? []
            return (
              <li key={dimension} className="grid gap-3 py-3 first:pt-0 last:pb-0 md:grid-cols-[12rem_1fr]">
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{dimensionLabel}</span>
                    {value === null ? (
                      <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {t("interviewWorkflow.report.insufficientEvidence")}
                      </span>
                    ) : (
                      <span className="font-serif text-2xl font-bold leading-none text-cobalt">{value}</span>
                    )}
                  </div>
                  {value === null ? null : (
                    <div
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={t("interviewWorkflow.report.scoreAria", { dimension: dimensionLabel, score: value })}
                      aria-valuenow={value}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="h-full rounded-full bg-cobalt" style={{ width: `${value}%` }} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 border-l border-border pl-4">
                  <p className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground">
                    <Quote className="size-3" aria-hidden />
                    {t("interviewWorkflow.report.evidenceLabel")}
                  </p>
                  {evidence.length === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">{t("interviewWorkflow.report.noEvidence")}</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {evidence.map((item, index) => (
                        <li key={`${index}-${item}`} className="wrap-anywhere text-xs leading-5 text-secondary-foreground">
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <BulletList title={t("interviewWorkflow.report.highlightsTitle")} items={report.highlights} icon="highlight" tone="cobalt" />
        <BulletList title={t("interviewWorkflow.report.gapsTitle")} items={report.gaps} icon="gap" tone="coral" />
        <BulletList title={t("interviewWorkflow.report.suggestionsTitle")} items={report.suggestions} icon="suggestion" tone="cobalt" />
      </div>
    </Panel>
  )
}

function QuestionCard({
  sessionId,
  question,
  active,
}: {
  sessionId: string
  question: InterviewQuestionView
  active: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState("")
  const [validation, setValidation] = useState("")
  const idempotencyKeys = useRef(new Map<string, string>())

  const submit = useMutation({
    mutationFn: (content: string) => {
      const existing = idempotencyKeys.current.get(question.id)
      const idempotencyKey = existing ?? crypto.randomUUID()
      idempotencyKeys.current.set(question.id, idempotencyKey)
      return submitInterviewAnswer(sessionId, { questionId: question.id, content, idempotencyKey })
    },
    onSuccess: (result) => {
      idempotencyKeys.current.delete(question.id)
      if (result.followUpQuestion) {
        const followUp = result.followUpQuestion
        queryClient.setQueryData<InterviewSessionDetail>(["interview", "session", sessionId], (previous) =>
          previous && !previous.questions.some((item) => item.id === followUp.id)
            ? { ...previous, questions: [...previous.questions, followUp] }
            : previous,
        )
      }
      setDraft("")
      void queryClient.invalidateQueries({ queryKey: ["interview", "session", sessionId] })
    },
  })

  function handleSubmit() {
    const content = draft.trim()
    if (content === "") {
      setValidation(t("interviewWorkflow.session.answerRequired"))
      return
    }
    setValidation("")
    submit.mutate(content)
  }

  return (
    <li className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t("interviewWorkflow.session.questionOrdinal", { ordinal: question.ordinal })}
        </h3>
        <span className="rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
          {t(`interviewWorkflow.session.kind.${question.kind}`, { defaultValue: question.kind })}
        </span>
        {question.kind === "follow_up" ? (
          <span className="rounded-md border border-cobalt/40 bg-cobalt/5 px-2 py-0.5 text-[11px] font-medium text-cobalt">
            {t("interviewWorkflow.session.followUpBadge")}
          </span>
        ) : null}
      </div>

      <p className="wrap-anywhere mt-2 text-sm leading-6 text-foreground">{question.prompt}</p>
      {question.kind === "follow_up" ? (
        <p className="mt-1 text-xs text-muted-foreground">{t("interviewWorkflow.session.followUpHint")}</p>
      ) : null}

      {question.referencePoints.length > 0 ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
            {t("interviewWorkflow.session.referencePointsLabel")}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-5 text-secondary-foreground">
            {question.referencePoints.map((point) => (
              <li key={point} className="wrap-anywhere">
                {point}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {question.answer ? (
        <div className="mt-3 border-l-2 border-cobalt/40 pl-3">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
            {t("interviewWorkflow.session.yourAnswerLabel")}
          </p>
          <p className="wrap-anywhere mt-1 text-sm leading-6 text-secondary-foreground">{question.answer.content}</p>
        </div>
      ) : active ? (
        <div className="mt-3 space-y-2">
          <label htmlFor={`answer-${question.id}`} className="text-[11px] font-medium tracking-wide text-muted-foreground">
            {t("interviewWorkflow.session.yourAnswerLabel")}
          </label>
          <textarea
            id={`answer-${question.id}`}
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            value={draft}
            placeholder={t("interviewWorkflow.session.answerPlaceholder")}
            onChange={(event) => {
              setDraft(event.target.value)
              if (validation) setValidation("")
            }}
          />
          {validation ? (
            <p role="alert" className="text-xs text-coral">
              {validation}
            </p>
          ) : null}
          {submit.isError ? (
            <InterviewErrorNotice title={t("interviewWorkflow.session.submitErrorTitle")} cause={submit.error} />
          ) : null}
          <button
            type="button"
            disabled={submit.isPending}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden />
            {submit.isPending ? t("interviewWorkflow.session.submitting") : t("interviewWorkflow.session.submit")}
          </button>
        </div>
      ) : null}
    </li>
  )
}

export function InterviewSessionPage() {
  const { id = "" } = useParams()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const session = useQuery({
    queryKey: ["interview", "session", id],
    queryFn: () => getInterviewSession(id),
    enabled: id !== "",
  })

  const completed = session.data?.status === "completed"
  const storedReport = session.data?.report ?? null
  const reportQuery = useQuery({
    queryKey: ["interview", "report", id],
    queryFn: () => getInterviewReport(id),
    enabled: completed && storedReport === null,
  })

  const finish = useMutation({
    mutationFn: () => finishInterviewSession(id),
    onSuccess: (result) => {
      queryClient.setQueryData<InterviewSessionDetail>(["interview", "session", id], (previous) =>
        previous ? { ...previous, status: "completed", report: result } : previous,
      )
      void queryClient.invalidateQueries({ queryKey: ["interview", "session", id] })
      void queryClient.invalidateQueries({ queryKey: ["interview", "sessions"] })
    },
  })

  if (session.isPending) {
    return (
      <div className="space-y-6">
        <SectionHeader eyebrow={t("interviewWorkflow.meta.eyebrow")} title={t("interviewWorkflow.session.loading")} />
        <StateBlock kind="loading" title={t("interviewWorkflow.session.loading")} />
      </div>
    )
  }

  if (session.isError || !session.data) {
    return (
      <div className="space-y-6">
        <SectionHeader eyebrow={t("interviewWorkflow.meta.eyebrow")} title={t("interviewWorkflow.session.errorTitle")} />
        <InterviewErrorNotice title={t("interviewWorkflow.session.errorTitle")} cause={session.error} />
        <Link
          to="/interview"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("interviewWorkflow.session.back")}
        </Link>
      </div>
    )
  }

  const detail = session.data
  const snapshot = detail.contextSnapshot
  const allAnswered = detail.questions.length > 0 && detail.questions.every((question) => question.answer !== null)
  const activeReport = storedReport ?? reportQuery.data ?? null
  const reportPending = completed && activeReport === null && reportQuery.isPending

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow={t("interviewWorkflow.meta.eyebrow")}
        title={completed ? t("interviewWorkflow.report.title") : snapshot.role || detail.role}
        description={t("interviewWorkflow.meta.description")}
        actions={
          <Link
            to="/interview"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t("interviewWorkflow.session.back")}
          </Link>
        }
      />

      <Panel title={t("interviewWorkflow.meta.title")}>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <MetaRow label={t("interviewWorkflow.session.roleLabel")} value={snapshot.role || detail.role} />
          <MetaRow label={t("interviewWorkflow.session.resumeLabel")} value={snapshot.resumeTitle} />
          <MetaRow label={t("interviewWorkflow.session.jdLabel")} value={snapshot.jdRole} />
          <MetaRow label={t("interviewWorkflow.session.companyLabel")} value={snapshot.jdCompany ?? "—"} />
          <MetaRow
            label={t("interviewWorkflow.session.rubricLabel")}
            value={completed ? `${detail.rubricVersion} · ${t("interviewWorkflow.session.rubricFrozen")}` : detail.rubricVersion}
          />
        </dl>
        {completed ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Snowflake className="size-3.5 text-cobalt" aria-hidden />
            {t("interviewWorkflow.session.completedCaption")}
          </p>
        ) : null}
      </Panel>

      <Panel title={t("interviewWorkflow.session.questionsTitle")}>
        <ol className="mt-4 space-y-5">
          {detail.questions.map((question) => (
            <QuestionCard key={question.id} sessionId={detail.id} question={question} active={!completed} />
          ))}
        </ol>
      </Panel>

      {!completed ? (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {allAnswered ? t("interviewWorkflow.session.allAnswered") : t("interviewWorkflow.session.finishHint")}
            </p>
            <button
              type="button"
              disabled={!allAnswered || finish.isPending}
              onClick={() => finish.mutate()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {finish.isPending ? t("interviewWorkflow.session.finishing") : t("interviewWorkflow.session.finish")}
            </button>
          </div>
          {finish.isError ? (
            <div className="mt-3">
              <InterviewErrorNotice title={t("interviewWorkflow.session.finishErrorTitle")} cause={finish.error} />
            </div>
          ) : null}
        </Panel>
      ) : null}

      {activeReport ? (
        <ReportPanel report={activeReport} />
      ) : completed ? (
        <StateBlock
          kind={reportPending ? "loading" : "empty"}
          title={reportPending ? t("interviewWorkflow.session.reportPending") : t("interviewWorkflow.session.reportMissing")}
        />
      ) : null}
    </div>
  )
}
