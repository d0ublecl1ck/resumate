// 模拟面试会话屏幕（Storybook 先行）：语音与文字双通道问答、按要点追问、转写可核对。
// 数据为文件内常量 mock，不发起任何网络请求；交互全部由本地 state 驱动。
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, CircleCheck, Clock, MessageSquareText, Mic, Send } from "lucide-react"
import { Panel, SectionHeader } from "@/features/interview/section-header"

type Speaker = "interviewer" | "candidate"
type Channel = "question" | "voice" | "text"

type Turn = {
  id: string
  speaker: Speaker
  channel: Channel
  time: string
  textKey?: string
  text?: string
  textParams?: Record<string, string>
  tagKey?: string
  sourceKey?: string
  basisKey?: string
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
          <span className="text-muted-foreground">{turn.time}</span>
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
      </article>
    </li>
  )
}

export function SessionScreen() {
  const { t } = useTranslation()
  const [turns, setTurns] = useState<Turn[]>(TURNS)
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState(false)
  const seqRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const flowRef = useRef<HTMLOListElement | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    }
  }, [])

  useEffect(() => {
    const flow = flowRef.current
    if (flow) flow.scrollTop = flow.scrollHeight
  }, [turns])

  function submit(channel: "voice" | "text") {
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

  const canSend = draft.trim().length > 0 && !pending

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <SectionHeader
        eyebrow={t("interviewSession.meta.eyebrow")}
        title={t("interviewSession.meta.title")}
        description={t("interviewSession.meta.description")}
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-cobalt">
              <Mic className="size-3.5" aria-hidden />
              {t("interviewSession.header.voiceChannel")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Clock className="size-3.5" aria-hidden />
              {t("interviewSession.header.elapsed")}
            </span>
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
            {turns.map((turn) => (
              <TurnBubble key={turn.id} turn={turn} />
            ))}
          </ol>
        </section>

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1 lg:col-span-1">
          <Panel title={t("interviewSession.session.title")} caption={t("interviewSession.session.caption")}>
            <dl className="mt-1 divide-y divide-border">
              {SESSION_ROWS.map((row) => (
                <div key={row.labelKey} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                  <dt className="text-muted-foreground">{t(row.labelKey)}</dt>
                  <dd className="text-right font-medium text-card-foreground">{t(row.valueKey)}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title={t("interviewSession.voice.title")} caption={t("interviewSession.voice.caption")}>
            <ul className="mt-2 flex flex-col gap-2">
              {VOICE_ROWS.map((row) => (
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
          </Panel>
        </div>
      </div>

      <div className="mt-3 flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-cobalt">
          <Mic className="size-4" aria-hidden />
        </span>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              submit("text")
            }
          }}
          placeholder={t("interviewSession.composer.placeholder")}
          aria-label={t("interviewSession.composer.placeholder")}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => submit("voice")}
          disabled={!canSend}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mic className="size-4" aria-hidden />
          {t("interviewSession.composer.voiceSend")}
        </button>
        <button
          type="button"
          onClick={() => submit("text")}
          disabled={!canSend}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-4" aria-hidden />
          {t("interviewSession.composer.send")}
        </button>
      </div>
    </div>
  )
}
