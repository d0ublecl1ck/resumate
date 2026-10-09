// 语音面试屏幕（Storybook 先行）：题目 TTS 播报、麦克风授权、按住录音与转写核对，
// 以及语音服务不可用时降级为文字作答。数据为文件内常量 mock，交互只用本地状态，不发起网络请求。
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Activity,
  AlertTriangle,
  AudioLines,
  BadgeCheck,
  CircleCheck,
  Clock,
  Keyboard,
  Mic,
  MicOff,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Volume2,
} from "lucide-react"
import { Panel, SectionHeader } from "@/features/interview/section-header"

/** 录音波形：纯 CSS 条，高度错落 + 脉冲动画。 */
const WAVE_BARS = ["h-3", "h-5", "h-7", "h-4", "h-6", "h-2", "h-5", "h-7", "h-4", "h-6", "h-3", "h-5"]

type PriorTurn = { id: string; speaker: "interviewer" | "candidate"; textKey: string; voice?: boolean }

const PRIOR_TURNS: PriorTurn[] = [
  { id: "q1", speaker: "interviewer", textKey: "interviewVoice.turns.q1" },
  { id: "a1", speaker: "candidate", textKey: "interviewVoice.turns.a1", voice: true },
]

const SESSION_ROWS = [
  { labelKey: "interviewVoice.panel.session.role", valueKey: "interviewVoice.panel.session.roleValue" },
  { labelKey: "interviewVoice.panel.session.scale", valueKey: "interviewVoice.panel.session.scaleValue" },
  { labelKey: "interviewVoice.panel.session.elapsed", valueKey: "interviewVoice.panel.session.elapsedValue" },
]

const GAP_KEYS = [
  "interviewVoice.panel.gaps.items.sqlCount",
  "interviewVoice.panel.gaps.items.cacheConsistency",
  "interviewVoice.panel.gaps.items.metricScope",
]

function formatTime(total: number) {
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, "0")
  const seconds = (total % 60).toString().padStart(2, "0")
  return minutes + ":" + seconds
}

function Bubble({
  speaker,
  voice,
  verified,
  channelText,
}: {
  speaker: "interviewer" | "candidate"
  voice?: boolean
  verified?: boolean
  channelText?: string
}) {
  const { t } = useTranslation()
  const isInterviewer = speaker === "interviewer"
  return (
    <div className={isInterviewer ? "flex justify-start" : "flex justify-end"}>
      <article
        className={
          "w-fit max-w-[88%] rounded-xl border border-border px-4 py-2.5 " +
          (isInterviewer ? "bg-muted" : "bg-card")
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-foreground">
            {isInterviewer
              ? t("interviewVoice.conversation.interviewer")
              : t("interviewVoice.conversation.candidate")}
          </span>
          {voice ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-cobalt">
              <Mic className="size-3" aria-hidden />
              {t("interviewVoice.conversation.channelVoice")}
            </span>
          ) : null}
          {verified ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
              <CircleCheck className="size-3" aria-hidden />
              {t("interviewVoice.conversation.verified")}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-card-foreground">{channelText}</p>
      </article>
    </div>
  )
}

export function VoiceScreen() {
  const { t } = useTranslation()
  const [outage, setOutage] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [granted, setGranted] = useState(false)
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [draft, setDraft] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<{ text: string; channel: "voice" | "text" } | null>(null)
  const [textAnswer, setTextAnswer] = useState("")

  // TTS 播报：点击后维持 3 秒播放态。
  useEffect(() => {
    if (!playing) return
    const id = window.setTimeout(() => setPlaying(false), 3000)
    return () => window.clearTimeout(id)
  }, [playing])

  // 录音计时：进入录音态后每秒 +1。
  useEffect(() => {
    if (!recording) return
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(id)
  }, [recording])

  const startRecording = () => {
    setSeconds(0)
    setRecording(true)
  }
  const stopRecording = () => {
    setRecording(false)
    setDraft(t("interviewVoice.answer.transcribe.sample"))
  }
  const confirmDraft = () => {
    if (!draft || !draft.trim()) return
    setConfirmed({ text: draft.trim(), channel: "voice" })
    setDraft(null)
  }
  const rerecord = () => {
    setConfirmed(null)
    setDraft(null)
    setSeconds(0)
  }
  const sendText = () => {
    if (!textAnswer.trim()) return
    setConfirmed({ text: textAnswer.trim(), channel: "text" })
    setTextAnswer("")
  }

  const voiceRows = [
    {
      key: "asr",
      icon: AudioLines,
      available: !outage,
      detailKey: outage
        ? "interviewVoice.panel.voice.asrDownDetail"
        : "interviewVoice.panel.voice.asrDetail",
    },
    {
      key: "tts",
      icon: Volume2,
      available: !outage,
      detailKey: outage
        ? "interviewVoice.panel.voice.ttsDownDetail"
        : "interviewVoice.panel.voice.ttsDetail",
    },
  ]

  return (
    <div className="flex flex-col">
      <SectionHeader
        eyebrow={t("interviewVoice.meta.eyebrow")}
        title={t("interviewVoice.meta.title")}
        description={t("interviewVoice.meta.description")}
        actions={
          <button
            type="button"
            role="switch"
            aria-checked={outage}
            onClick={() => {
              // 切到降级态时立即退出语音链路，只保留文字输入。
              if (!outage) {
                setPlaying(false)
                setRecording(false)
                setDraft(null)
              }
              setOutage(!outage)
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground"
          >
            <span
              className={
                "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors " +
                (outage ? "bg-coral" : "bg-secondary")
              }
              aria-hidden
            >
              <span
                className={
                  "inline-block size-3 rounded-full bg-card transition-transform " +
                  (outage ? "translate-x-3.5" : "translate-x-0.5")
                }
              />
            </span>
            {t("interviewVoice.header.outageSwitch")}
          </button>
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-3 lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2.5">
              <h2 className="text-sm font-semibold text-card-foreground">
                {t("interviewVoice.conversation.title")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("interviewVoice.conversation.caption")}</p>
            </header>
            <div className="mt-3 flex flex-col gap-2.5">
              {PRIOR_TURNS.map((turn) => (
                <Bubble
                  key={turn.id}
                  speaker={turn.speaker}
                  voice={turn.voice}
                  verified={turn.voice}
                  channelText={t(turn.textKey)}
                />
              ))}

              <div className="flex justify-start">
                <article className="w-fit max-w-[92%] rounded-xl border border-border bg-muted px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground">
                      {t("interviewVoice.conversation.interviewer")}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-cobalt">
                      <Activity className="size-3" aria-hidden />
                      {t("interviewVoice.question.label")}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-card-foreground">
                    {t("interviewVoice.turns.q2")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                    <button
                      type="button"
                      disabled={outage}
                      onClick={() => setPlaying((value) => !value)}
                      className={
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium " +
                        (outage
                          ? "border-border bg-secondary text-muted-foreground"
                          : "border-cobalt/40 bg-cobalt/5 text-cobalt")
                      }
                    >
                      {playing ? (
                        <AudioLines className="size-3.5 animate-pulse" aria-hidden />
                      ) : (
                        <Play className="size-3.5" aria-hidden />
                      )}
                      {playing ? t("interviewVoice.question.playing") : t("interviewVoice.question.play")}
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      {outage ? t("interviewVoice.panel.voice.ttsDownDetail") : t("interviewVoice.question.hint")}
                    </span>
                  </div>
                </article>
              </div>

              {confirmed ? (
                <div className="flex flex-col items-end gap-1.5">
                  <Bubble
                    speaker="candidate"
                    voice={confirmed.channel === "voice"}
                    verified={confirmed.channel === "voice"}
                    channelText={confirmed.text}
                  />
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-cobalt/40 bg-cobalt/5 px-2 py-0.5 text-[11px] font-medium text-cobalt">
                      <BadgeCheck className="size-3" aria-hidden />
                      {t("interviewVoice.answer.confirmed.badge")}
                    </span>
                    {outage ? null : (
                      <button
                        type="button"
                        onClick={rerecord}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground"
                      >
                        <RotateCcw className="size-3" aria-hidden />
                        {t("interviewVoice.answer.confirmed.rerecord")}
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2.5">
              <h2 className="text-sm font-semibold text-card-foreground">
                {t("interviewVoice.answer.title")}
              </h2>
              <p className="text-xs text-muted-foreground">{t("interviewVoice.answer.caption")}</p>
            </header>

            {outage ? (
              <div className="mt-3">
                <p className="flex items-start gap-2 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t("interviewVoice.answer.degraded.banner")}
                </p>
                <div className="mt-3 flex items-start gap-2">
                  <textarea
                    rows={3}
                    value={textAnswer}
                    onChange={(event) => setTextAnswer(event.target.value)}
                    placeholder={t("interviewVoice.answer.degraded.placeholder")}
                    aria-label={t("interviewVoice.answer.degraded.placeholder")}
                    className="w-full resize-none rounded-lg border border-input bg-card p-3 text-sm text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={sendText}
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    <Send className="size-4" aria-hidden />
                    {t("interviewVoice.answer.degraded.send")}
                  </button>
                </div>
              </div>
            ) : !granted ? (
              <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted px-4 py-5 text-center">
                <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                  <MicOff className="size-5" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-card-foreground">
                  {t("interviewVoice.answer.notGranted.title")}
                </p>
                <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                  {t("interviewVoice.answer.notGranted.body")}
                </p>
                <button
                  type="button"
                  onClick={() => setGranted(true)}
                  className="mt-1 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  <ShieldCheck className="size-4" aria-hidden />
                  {t("interviewVoice.answer.notGranted.allow")}
                </button>
                <p className="text-[11px] text-muted-foreground">
                  {t("interviewVoice.answer.notGranted.privacy")}
                </p>
              </div>
            ) : recording ? (
              <div className="mt-3 rounded-xl border border-coral bg-coral/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-coral">
                    <span className="size-2 animate-pulse rounded-full bg-coral" aria-hidden />
                    {t("interviewVoice.answer.ready.recording")}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatTime(seconds)}
                  </span>
                </div>
                <div className="mt-3 flex h-8 items-center gap-1.5" aria-hidden>
                  {WAVE_BARS.map((bar, index) => (
                    <span key={index} className={"w-1.5 animate-pulse rounded-full bg-coral " + bar} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-coral bg-card px-4 py-2 text-sm font-medium text-coral"
                >
                  <Square className="size-4" aria-hidden />
                  {t("interviewVoice.answer.ready.stop")}
                </button>
              </div>
            ) : draft !== null ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-cobalt">
                    <AudioLines className="size-3.5" aria-hidden />
                    {t("interviewVoice.answer.transcribe.title")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("interviewVoice.answer.transcribe.hint")}
                  </p>
                </div>
                <textarea
                  rows={3}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label={t("interviewVoice.answer.transcribe.title")}
                  className="mt-2 w-full resize-none rounded-lg border border-input bg-card p-3 text-sm text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={confirmDraft}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    <CircleCheck className="size-4" aria-hidden />
                    {t("interviewVoice.answer.transcribe.confirm")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-col items-center gap-2 py-2">
                <button
                  type="button"
                  onClick={startRecording}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
                >
                  <Mic className="size-5" aria-hidden />
                  {t("interviewVoice.answer.ready.hold")}
                </button>
                <p className="text-xs text-muted-foreground">{t("interviewVoice.answer.ready.hint")}</p>
              </div>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-2 lg:col-span-1">
          <Panel
            title={t("interviewVoice.panel.voice.title")}
            caption={t("interviewVoice.panel.voice.caption")}
          >
            <ul className="mt-2 flex flex-col gap-2">
              {voiceRows.map((row) => {
                const Icon = row.icon
                return (
                  <li
                    key={row.key}
                    className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2"
                  >
                    <span
                      className={
                        "mt-1.5 size-2 shrink-0 rounded-full " + (row.available ? "bg-cobalt" : "bg-coral")
                      }
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-card-foreground">
                          <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                          {t("interviewVoice.panel.voice." + row.key)}
                        </p>
                        <span
                          className={
                            "rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                            (row.available
                              ? "border-cobalt/40 bg-cobalt/5 text-cobalt"
                              : "border-coral bg-coral/10 text-coral")
                          }
                        >
                          {t(
                            row.available
                              ? "interviewVoice.panel.voice.available"
                              : "interviewVoice.panel.voice.unavailable",
                          )}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t(row.detailKey)}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>

          <Panel
            title={t("interviewVoice.panel.session.title")}
            caption={t("interviewVoice.panel.session.caption")}
          >
            <dl className="mt-1 divide-y divide-border">
              {SESSION_ROWS.map((row) => (
                <div
                  key={row.labelKey}
                  className="flex items-center justify-between gap-3 py-1.5 text-xs"
                >
                  <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                    {row.labelKey === "interviewVoice.panel.session.elapsed" ? (
                      <Clock className="size-3.5" aria-hidden />
                    ) : null}
                    {t(row.labelKey)}
                  </dt>
                  <dd className="text-right font-medium text-card-foreground">{t(row.valueKey)}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel
            title={t("interviewVoice.panel.gaps.title")}
            caption={t("interviewVoice.panel.gaps.caption")}
          >
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

          {outage ? (
            <p className="flex items-center gap-1.5 rounded-lg border border-coral/40 bg-coral/10 px-3 py-1.5 text-[11px] font-medium text-coral">
              <Keyboard className="size-3.5" aria-hidden />
              {t("interviewVoice.header.outageBadge")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
