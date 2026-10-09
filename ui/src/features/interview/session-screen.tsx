// 模拟面试会话屏幕：语音与文字双通道问答、按要点追问、转写可核对。
// 受控模式（传入 session）由页面提供真实会话与回调，本屏只负责呈现与本地交互；
// 无 props 时回退到文件内设计样例，供 Storybook 预览设计稿，全部交互由本地 state 驱动。
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { AlertTriangle, CircleCheck, Clock, MessageSquareText, Mic, Send } from "lucide-react"

import { Panel, SectionHeader } from "@/features/interview/section-header"
import { InterviewErrorNotice } from "@/components/interview-error-notice"
import type { InterviewSessionDetail } from "@/lib/interview"

type Speaker = "interviewer" | "candidate"
type Channel = "question" | "voice" | "text"

type Turn = {
  id: string
  speaker: Speaker
  channel: Channel
  time?: string
  textKey?: string
  text?: string
  textParams?: Record<string, string>
  tagKey?: string
  sourceKey?: string
  basisKey?: string
  /** 真实题目的参考要点原文；以 referenceKind 决定用「参考要点」还是「追问依据」标签。 */
  reference?: string
  referenceKind?: "source" | "basis"
}

const TURNS: Turn[] = [
  {
    id: "q1",
    speaker: "interviewer",
    channel: "question",
    time: "14:02",
    textKey: "interviewSession.conversation.turns.q1",
    tagKey: "interviewSession.conversation.tag.technical",
    sourceKey: "interviewSession.conversation.turns.q1Source",
  },
  {
    id: "a1",
    speaker: "candidate",
    channel: "voice",
    time: "14:05",
    textKey: "interviewSession.conversation.turns.a1",
  },
  {
    id: "q2",
    speaker: "interviewer",
    channel: "question",
    time: "14:09",
    textKey: "interviewSession.conversation.turns.q2",
    tagKey: "interviewSession.conversation.tag.followUp",
    basisKey: "interviewSession.conversation.turns.q2Gap",
  },
  {
    id: "a2",
    speaker: "candidate",
    channel: "text",
    time: "14:12",
    textKey: "interviewSession.conversation.turns.a2",
  },
]

const SESSION_ROWS = [
  { labelKey: "interviewSession.session.rows.role", valueKey: "interviewSession.session.rows.roleValue" },
  { labelKey: "interviewSession.session.rows.resume", valueKey: "interviewSession.session.rows.resumeValue" },
  { labelKey: "interviewSession.session.rows.jd", valueKey: "interviewSession.session.rows.jdValue" },
  { labelKey: "interviewSession.session.rows.scale", valueKey: "interviewSession.session.rows.scaleValue" },
  { labelKey: "interviewSession.session.rows.elapsed", valueKey: "interviewSession.session.rows.elapsedValue" },
]

const VOICE_ROWS: { labelKey: string; detailKey: string; state: "online" | "fallback" }[] = [
  {
    labelKey: "interviewSession.voice.rows.asr",
    detailKey: "interviewSession.voice.rows.asrDetail",
    state: "online",
  },
  {
    labelKey: "interviewSession.voice.rows.tts",
    detailKey: "interviewSession.voice.rows.ttsDetail",
    state: "online",
  },
  {
    labelKey: "interviewSession.voice.rows.fallback",
    detailKey: "interviewSession.voice.rows.fallbackDetail",
    state: "fallback",
  },
]

const GAP_KEYS = [
  "interviewSession.gaps.items.gcTradeoff",
  "interviewSession.gaps.items.offHeap",
  "interviewSession.gaps.items.quantify",
]

/** 会话从 14:12 起继续走时间；每次问答占两分钟，避免依赖真实时钟导致截图不稳定。 */
const BASE_MINUTE = 14 * 60 + 12

function minuteLabel(offset: number) {
  const total = BASE_MINUTE + offset
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0")
}

const TOKEN_SPLIT = /[\s,，。.、；;：:！!？?（）()[\]【】"'“”「」]+/

/** 从刚提交的回答里挑一个关键词用于追问：优先英文/数字术语，否则取最长的中文片段前 8 个字。 */
function pickKeyword(answer: string) {
  const ascii = answer.match(/[A-Za-z][A-Za-z0-9+#.-]{1,}/g)
  if (ascii && ascii.length > 0) {
    return ascii.reduce((longest, token) => (token.length > longest.length ? token : longest))
  }
  const tokens = answer.split(TOKEN_SPLIT).filter((token) => token.length >= 2)
  if (tokens.length === 0) return ""
  const longest = tokens.reduce((best, token) => (token.length > best.length ? token : best))
  return longest.slice(0, 8)
}

/** 把真实会话的题目与作答铺成对话流：每道题一条面试官气泡，有作答则接一条候选人气泡。 */
function buildRealTurns(session: InterviewSessionDetail, voiceQuestionIds: Set<string>): Turn[] {
  const turns: Turn[] = []
  for (const question of session.questions) {
    const points = question.referencePoints.join("；")
    turns.push({
      id: "q-" + question.id,
      speaker: "interviewer",
      channel: "question",
      text: question.prompt,
      tagKey: "interviewWorkflow.session.kind." + question.kind,
      reference: points === "" ? undefined : points,
      referenceKind: question.kind === "follow_up" ? "basis" : "source",
    })
    if (question.answer) {
      turns.push({
        id: "a-" + question.id,
        speaker: "candidate",
        channel: voiceQuestionIds.has(question.id) ? "voice" : "text",
        text: question.answer.content,
      })
    }
  }
  return turns
}

function TurnBubble({ turn }: { turn: Turn }) {
  const { t } = useTranslation()
  const isInterviewer = turn.speaker === "interviewer"
  return (
    <li className={isInterviewer ? "flex justify-start" : "flex justify-end"}>
      <article
        className={
          "w-fit max-w-[88%] rounded-xl border border-border px-4 py-2.5 " +
          (isInterviewer ? "bg-muted" : "bg-card")
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">
            {isInterviewer
              ? t("interviewSession.conversation.interviewer")
              : t("interviewSession.conversation.candidate")}
          </span>
          {turn.time ? <span className="text-muted-foreground">{turn.time}</span> : null}
          {turn.tagKey ? (
            <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              {t(turn.tagKey)}
            </span>
          ) : null}
          {turn.channel === "voice" ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-cobalt">
                <Mic className="size-3" aria-hidden />
                {t("interviewSession.conversation.channelVoice")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                <CircleCheck className="size-3" aria-hidden />
                {t("interviewSession.conversation.transcriptVerified")}
              </span>
            </>
          ) : null}
          {turn.channel === "text" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              <MessageSquareText className="size-3" aria-hidden />
              {t("interviewSession.conversation.channelText")}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-card-foreground">
          {turn.textKey ? t(turn.textKey, turn.textParams) : turn.text}
        </p>
        {turn.sourceKey ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("interviewSession.conversation.sourceLine", { source: t(turn.sourceKey) })}
          </p>
        ) : null}
        {turn.basisKey ? (
          <p className="mt-1.5 inline-flex items-start gap-1 text-xs font-medium text-coral">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
            {t("interviewSession.conversation.basisLine", { basis: t(turn.basisKey) })}
          </p>
        ) : null}
        {turn.reference ? (
          <p className="mt-1.5 inline-flex items-start gap-1 text-xs font-medium text-coral">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
            {turn.referenceKind === "basis"
              ? t("interviewSession.conversation.basisLine", { basis: turn.reference })
              : t("interviewSession.conversation.referenceLine", { points: turn.reference })}
          </p>
        ) : null}
      </article>
    </li>
  )
}

export interface SessionScreenProps {
  /** 真实会话；不传（Storybook 设计预览）时回退到文件内设计样例。 */
  session?: InterviewSessionDetail | null
  /** 当前作答目标题；由页面按「第一道未作答」推导。 */
  activeQuestionId?: string | null
  /** 已用真实录音作答的题目 id，用于在对话流里如实标注语音通道。 */
  voiceQuestionIds?: string[]
  onAnswer?: (questionId: string, content: string) => void | Promise<void>
  onVoiceEntry?: (questionId: string) => void
  submitting?: boolean
  submitError?: unknown
  canFinish?: boolean
  onFinish?: () => void
  finishing?: boolean
  finishError?: unknown
  /** 当前浏览器是否具备真实录音 / 实时转写能力（真实模式下的链路状态）。 */
  voiceAvailable?: boolean
  asrAvailable?: boolean
}

export function SessionScreen({
  session,
  activeQuestionId = null,
  voiceQuestionIds,
  onAnswer,
  onVoiceEntry,
  submitting = false,
  submitError,
  canFinish = false,
  onFinish,
  finishing = false,
  finishError,
  voiceAvailable = false,
  asrAvailable = false,
}: SessionScreenProps = {}) {
  const { t } = useTranslation()
  const real = session != null
  const [draft, setDraft] = useState("")
  const [validation, setValidation] = useState("")
  const [turns, setTurns] = useState<Turn[]>(TURNS)
  const [pending, setPending] = useState(false)
  const seqRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const flowRef = useRef<HTMLOListElement | null>(null)

  const voiceSet = useMemo(() => new Set(voiceQuestionIds ?? []), [voiceQuestionIds])
  const realTurns = useMemo(
    () => (session ? buildRealTurns(session, voiceSet) : TURNS),
    [session, voiceSet],
  )
  const visibleTurns = real ? realTurns : turns

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    const flow = flowRef.current
    if (flow) flow.scrollTop = flow.scrollHeight
  }, [visibleTurns])

  const activeQuestion = useMemo(
    () => (session && activeQuestionId ? session.questions.find((item) => item.id === activeQuestionId) ?? null : null),
    [session, activeQuestionId],
  )

  /** 设计预览态：本地追加一轮回答，并模拟一次按关键词追问。 */
  function submitDesign(channel: "voice" | "text") {
    const answer = draft.trim()
    if (!answer || pending) return
    const seq = seqRef.current
    seqRef.current += 1
    setTurns((prev) => [
      ...prev,
      {
        id: "candidate-" + seq,
        speaker: "candidate",
        channel,
        time: minuteLabel(1 + seq * 2),
        text: answer,
      },
    ])
    setDraft("")
    setPending(true)
    const keyword = pickKeyword(answer)
    timerRef.current = window.setTimeout(() => {
      setTurns((prev) => [
        ...prev,
        {
          id: "follow-up-" + seq,
          speaker: "interviewer",
          channel: "question",
          time: minuteLabel(2 + seq * 2),
          textKey: keyword
            ? "interviewSession.dynamic.followUp"
            : "interviewSession.dynamic.followUpNoKeyword",
          textParams: keyword ? { keyword } : undefined,
          tagKey: "interviewSession.conversation.tag.followUp",
        },
      ])
      setPending(false)
      timerRef.current = null
    }, 600)
  }

  async function send() {
    if (!real) {
      submitDesign("text")
      return
    }
    if (!activeQuestion) return
    const content = draft.trim()
    if (content === "") {
      setValidation(t("interviewWorkflow.session.answerRequired"))
      return
    }
    setValidation("")
    try {
      await onAnswer?.(activeQuestion.id, content)
      setDraft("")
    } catch {
      // 失败出口由页面通过 submitError 传入，这里只保留草稿供重试。
    }
  }

  function openVoice() {
    if (!real) {
      submitDesign("voice")
      return
    }
    if (activeQuestion) onVoiceEntry?.(activeQuestion.id)
  }

  const canSend = real
    ? draft.trim().length > 0 && !submitting && activeQuestion != null
    : draft.trim().length > 0 && !pending

  const snapshot = session?.contextSnapshot
  const elapsedMinutes = useMemo(() => {
    if (!session) return 0
    const created = new Date(session.createdAt).getTime()
    if (Number.isNaN(created)) return 0
    return Math.max(0, Math.round((Date.now() - created) / 60000))
  }, [session])

  const metaRows = real && session
    ? [
        { label: t("interviewSession.session.rows.role"), value: snapshot?.role || session.role },
        { label: t("interviewSession.session.rows.resume"), value: snapshot?.resumeTitle ?? "" },
        { label: t("interviewSession.session.rows.jd"), value: snapshot?.jdRole ?? "" },
        { label: t("interviewSession.session.rows.company"), value: snapshot?.jdCompany ?? "—" },
        { label: t("interviewSession.session.rows.scale"), value: session.rubricVersion },
      ]
    : []

  const voiceRows = real
    ? [
        {
          label: t("interviewSession.voice.rows.asr"),
          detail: asrAvailable
            ? t("interviewSession.voice.rows.asrDetail")
            : t("interviewSession.voice.rows.asrUnavailableDetail"),
          available: asrAvailable,
        },
        {
          label: t("interviewSession.voice.rows.recorder"),
          detail: voiceAvailable
            ? t("interviewSession.voice.rows.recorderDetail")
            : t("interviewSession.voice.rows.recorderUnavailableDetail"),
          available: voiceAvailable,
        },
        {
          label: t("interviewSession.voice.rows.fallback"),
          detail: t("interviewSession.voice.rows.fallbackDetail"),
          available: true,
        },
      ]
    : []

  const title = real
    ? (snapshot?.role || session?.role || "") + " · " + t("interviewSession.meta.inProgress")
    : t("interviewSession.meta.title")

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <SectionHeader
        eyebrow={t("interviewSession.meta.eyebrow")}
        title={title}
        description={t("interviewSession.meta.description")}
        actions={
          <>
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium " +
                (real && !voiceAvailable ? "text-muted-foreground" : "text-cobalt")
              }
            >
              <Mic className="size-3.5" aria-hidden />
              {real && !voiceAvailable
                ? t("interviewSession.header.voiceUnavailable")
                : t("interviewSession.header.voiceChannel")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Clock className="size-3.5" aria-hidden />
              {real
                ? t("interviewSession.header.elapsedValue", { minutes: elapsedMinutes })
                : t("interviewSession.header.elapsed")}
            </span>
            <Link
              to="/interview"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
            >
              {t("interviewWorkflow.session.back")}
            </Link>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <section className="flex min-h-0 flex-col rounded-xl border border-border bg-card p-4 lg:col-span-2">
          <header className="flex shrink-0 flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2.5">
            <h2 className="text-sm font-semibold text-card-foreground">
              {t("interviewSession.conversation.title")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("interviewSession.conversation.caption")}</p>
          </header>
          <ol
            ref={flowRef}
            className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1"
          >
            {visibleTurns.map((turn) => (
              <TurnBubble key={turn.id} turn={turn} />
            ))}
          </ol>
        </section>

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1 lg:col-span-1">
          <Panel title={t("interviewSession.session.title")} caption={t("interviewSession.session.caption")}>
            <dl className="mt-1 divide-y divide-border">
              {real
                ? metaRows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="wrap-anywhere text-right font-medium text-card-foreground">{row.value}</dd>
                    </div>
                  ))
                : SESSION_ROWS.map((row) => (
                    <div key={row.labelKey} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                      <dt className="text-muted-foreground">{t(row.labelKey)}</dt>
                      <dd className="text-right font-medium text-card-foreground">{t(row.valueKey)}</dd>
                    </div>
                  ))}
            </dl>
          </Panel>

          <Panel title={t("interviewSession.voice.title")} caption={t("interviewSession.voice.caption")}>
            <ul className="mt-2 flex flex-col gap-2">
              {real
                ? voiceRows.map((row) => (
                    <li key={row.label} className="flex items-start gap-2">
                      <span
                        className={
                          "mt-1.5 size-2 shrink-0 rounded-full " +
                          (row.available ? "bg-cobalt" : "bg-gold")
                        }
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-card-foreground">{row.label}</p>
                        <p className="wrap-anywhere mt-0.5 text-xs text-muted-foreground">{row.detail}</p>
                      </div>
                    </li>
                  ))
                : VOICE_ROWS.map((row) => (
                    <li key={row.labelKey} className="flex items-start gap-2">
                      <span
                        className={
                          "mt-1.5 size-2 shrink-0 rounded-full " +
                          (row.state === "online" ? "bg-cobalt" : "bg-gold")
                        }
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-card-foreground">{t(row.labelKey)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t(row.detailKey)}</p>
                      </div>
                    </li>
                  ))}
            </ul>
          </Panel>

          <Panel title={t("interviewSession.gaps.title")} caption={t("interviewSession.gaps.caption")}>
            {real ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {(activeQuestion?.referencePoints ?? []).length === 0 ? (
                  <li className="text-xs text-muted-foreground">{t("interviewSession.gaps.empty")}</li>
                ) : (
                  (activeQuestion?.referencePoints ?? []).map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-card-foreground"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                      <span className="wrap-anywhere">{point}</span>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {GAP_KEYS.map((key) => (
                  <li
                    key={key}
                    className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-card-foreground"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {real ? (
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {canFinish
                    ? t("interviewWorkflow.session.allAnswered")
                    : t("interviewWorkflow.session.finishHint")}
                </p>
                <button
                  type="button"
                  disabled={!canFinish || finishing}
                  onClick={onFinish}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {finishing
                    ? t("interviewWorkflow.session.finishing")
                    : t("interviewWorkflow.session.finish")}
                </button>
              </div>
              {finishError ? (
                <div className="mt-3">
                  <InterviewErrorNotice
                    title={t("interviewWorkflow.session.finishErrorTitle")}
                    cause={finishError}
                  />
                </div>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-cobalt">
          <Mic className="size-4" aria-hidden />
        </span>
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            if (validation) setValidation("")
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          disabled={real && activeQuestion == null}
          placeholder={
            real && activeQuestion == null
              ? t("interviewWorkflow.session.allAnswered")
              : t("interviewSession.composer.placeholder")
          }
          aria-label={t("interviewSession.composer.placeholder")}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={openVoice}
          disabled={!canSend}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mic className="size-4" aria-hidden />
          {t("interviewSession.composer.voiceSend")}
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden />
          {submitting || pending ? t("interviewWorkflow.session.submitting") : t("interviewSession.composer.send")}
        </button>
      </div>

      {validation ? (
        <p role="alert" className="mt-2 text-xs text-coral">
          {validation}
        </p>
      ) : null}
      {submitError ? (
        <div className="mt-2">
          <InterviewErrorNotice
            title={t("interviewWorkflow.session.submitErrorTitle")}
            cause={submitError}
          />
        </div>
      ) : null}
    </div>
  )
}
