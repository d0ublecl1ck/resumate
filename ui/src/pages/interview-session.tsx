// SCR-015 模拟面试会话（Page）：只做取数与数据编排，界面分别由 Session/Voice/Report 三个屏承担。
// 约束：用户作答与报告正文是后端原话，不做翻译；作答输入用受控原生控件承载，不引入内建表单元素。
import { useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ArrowLeft } from "lucide-react"

import {
  finishInterviewSession,
  getInterviewReport,
  getInterviewSession,
  submitInterviewAnswer,
} from "@/lib/interview"
import type { InterviewSessionDetail } from "@/lib/interview"
import { createSpeechSegment, listSpeechSegments } from "@/lib/speech-api"
import type { SpeechWord } from "@/lib/speech-api"
import { summarizeExpression } from "@/lib/speech-metrics"
import { isMediaRecorderSupported, isSpeechRecognitionSupported } from "@/lib/speech-recorder"
import { InterviewReportScreen } from "@/features/interview/report-screen"
import { SessionScreen } from "@/features/interview/session-screen"
import { VoiceScreen } from "@/features/interview/voice-screen"
import { SectionHeader } from "@/features/interview/section-header"
import { StateBlock } from "@/components/kit/state-block"
import { InterviewErrorNotice } from "@/components/interview-error-notice"

interface AnswerSpeech {
  durationSeconds: number
  pauseCount: number
  words?: SpeechWord[]
  provider?: string
}

interface AnswerInput {
  questionId: string
  content: string
  /** 语音作答附带真实录音指标；文字作答不带。 */
  speech?: AnswerSpeech
}

export function InterviewSessionPage() {
  const { id = "" } = useParams()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [voiceQuestionId, setVoiceQuestionId] = useState<string | null>(null)
  const [mediaRecorderSupported] = useState(() => isMediaRecorderSupported())
  const [speechRecognitionSupported] = useState(() => isSpeechRecognitionSupported())
  const idempotencyKeys = useRef(new Map<string, string>())

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

  // 表达维度读真实落库的语音指标；没有记录时 summarizeExpression 返回空值，报告显示「不适用」。
  const speechQuery = useQuery({
    queryKey: ["interview", "speech", id],
    queryFn: () => listSpeechSegments(id),
    enabled: id !== "",
  })
  const expression = useMemo(() => summarizeExpression(speechQuery.data ?? []), [speechQuery.data])
  const voiceQuestionIds = useMemo(
    () =>
      (speechQuery.data ?? [])
        .map((segment) => segment.questionId)
        .filter((questionId): questionId is string => questionId !== null),
    [speechQuery.data],
  )

  // 文字与语音作答共用一条提交路径：语音先落指标，再复用既有作答接口。
  const answer = useMutation({
    mutationFn: async (input: AnswerInput) => {
      if (input.speech) {
        await createSpeechSegment({
          durationSeconds: input.speech.durationSeconds,
          transcript: input.content,
          sessionId: id,
          questionId: input.questionId,
          // 有时间戳时服务端按真实间隔算停顿；否则沿用浏览器静音检测的计数。
          pauseCount: input.speech.words ? undefined : input.speech.pauseCount,
          words: input.speech.words,
          provider: input.speech.provider,
        })
      }
      const existing = idempotencyKeys.current.get(input.questionId)
      const idempotencyKey = existing ?? crypto.randomUUID()
      idempotencyKeys.current.set(input.questionId, idempotencyKey)
      return submitInterviewAnswer(id, {
        questionId: input.questionId,
        content: input.content,
        idempotencyKey,
      })
    },
    onSuccess: (result, variables) => {
      idempotencyKeys.current.delete(variables.questionId)
      if (result.followUpQuestion) {
        const followUp = result.followUpQuestion
        queryClient.setQueryData<InterviewSessionDetail>(["interview", "session", id], (previous) =>
          previous && !previous.questions.some((item) => item.id === followUp.id)
            ? { ...previous, questions: [...previous.questions, followUp] }
            : previous,
        )
      }
      if (variables.speech) setVoiceQuestionId(null)
      void queryClient.invalidateQueries({ queryKey: ["interview", "session", id] })
      void queryClient.invalidateQueries({ queryKey: ["interview", "speech", id] })
    },
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
  const activeReport = storedReport ?? reportQuery.data ?? null
  const reportPending = completed && activeReport === null && reportQuery.isPending

  if (completed) {
    return activeReport ? (
      <InterviewReportScreen report={activeReport} role={detail.contextSnapshot.role || detail.role} speech={expression} />
    ) : (
      <div className="space-y-6">
        <SectionHeader eyebrow={t("interviewWorkflow.meta.eyebrow")} title={t("interviewWorkflow.report.title")} />
        <StateBlock
          kind={reportPending ? "loading" : "empty"}
          title={reportPending ? t("interviewWorkflow.session.reportPending") : t("interviewWorkflow.session.reportMissing")}
        />
      </div>
    )
  }

  const allAnswered = detail.questions.length > 0 && detail.questions.every((question) => question.answer !== null)
  const activeQuestion = detail.questions.find((question) => question.answer === null) ?? null
  const voiceQuestion = voiceQuestionId
    ? detail.questions.find((question) => question.id === voiceQuestionId) ?? null
    : null

  if (voiceQuestion) {
    return (
      <VoiceScreen
        session={detail}
        question={voiceQuestion}
        voiceQuestionIds={voiceQuestionIds}
        onBack={() => setVoiceQuestionId(null)}
        saving={answer.isPending}
        error={answer.error}
        onRecorded={(recorded) => {
          answer.mutate({
            questionId: voiceQuestion.id,
            content: recorded.transcript,
            speech: {
              durationSeconds: recorded.durationSeconds,
              pauseCount: recorded.pauseCount,
              words: recorded.words,
              provider: recorded.provider,
            },
          })
        }}
      />
    )
  }

  return (
    <SessionScreen
      session={detail}
      activeQuestionId={activeQuestion?.id ?? null}
      voiceQuestionIds={voiceQuestionIds}
      onAnswer={async (questionId, content) => {
        await answer.mutateAsync({ questionId, content })
      }}
      onVoiceEntry={(questionId) => setVoiceQuestionId(questionId)}
      submitting={answer.isPending}
      submitError={answer.error}
      canFinish={allAnswered}
      onFinish={() => finish.mutate()}
      finishing={finish.isPending}
      finishError={finish.error}
      voiceAvailable={mediaRecorderSupported}
      asrAvailable={speechRecognitionSupported}
    />
  )
}
