// 语音面试屏幕：题目 TTS 播报、麦克风授权、真实录音与转写核对。
// 录音用 MediaRecorder 真实采集并计时，转写优先云端 ASR、其次浏览器 SpeechRecognition；
// 录音或转写不可用时明确降级为手动文本 + 手填时长，绝不用假数据填充。
// 原始音频不上传，只把真实时长与转写提交后端计算指标。
// 受控模式（传入 session/question）由页面提供真实会话与当前题；无 props 时回退到设计样例。
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Activity,
  AlertTriangle,
  AudioLines,
  BadgeCheck,
  ChevronLeft,
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
import { InterviewErrorNotice } from "@/components/interview-error-notice"
import type { InterviewQuestionView, InterviewSessionDetail } from "@/lib/interview"
import { ApiRequestError } from "@/lib/api-client"
import { useCloudTranscription } from "@/lib/speech-cloud"
import type { SpeechChannel } from "@/lib/speech-cloud"
import { useVoiceRecorder } from "@/lib/speech-recorder"
import { synthesizeSpeech } from "@/lib/speech-api"
import type { SpeechWord } from "@/lib/speech-api"

/** 把云端识别失败映射成 i18n 文案；未知错误走 generic，绝不直出原始报错。 */
function speechErrorCode(error: unknown): string {
  return error instanceof ApiRequestError ? error.code : "generic"
}

/** 云端播报失败码映射；未知错误走 generic，绝不直出原始报错。 */
function ttsErrorCode(error: unknown): string {
  return error instanceof ApiRequestError ? error.code : "generic"
}

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
  channelText: string
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
        <p className="wrap-anywhere mt-1.5 text-sm leading-relaxed text-card-foreground">{channelText}</p>
      </article>
    </div>
  )
}

export interface VoiceScreenProps {
  /** 真实会话；与 question 一起传入时进入受控模式。 */
  session?: InterviewSessionDetail | null
  /** 当前作答的真实题目；不传时回退到设计样例。 */
  question?: InterviewQuestionView | null
  /** 已用真实录音作答的题目 id，用于在上下文里标注语音通道。 */
  voiceQuestionIds?: string[]
  onBack?: () => void
  saving?: boolean
  error?: unknown
  /** 确认作答时回调真实时长、转写、时间戳与当前链路；由页面决定是否落库。 */
  onRecorded?: (answer: {
    durationSeconds: number
    transcript: string
    pauseCount: number
    words?: SpeechWord[]
    provider?: string
    channel?: SpeechChannel
  }) => void
}

export function VoiceScreen({
  session,
  question,
  voiceQuestionIds,
  onBack,
  saving = false,
  error,
  onRecorded,
}: VoiceScreenProps = {}) {
  const { t } = useTranslation()
  const recorder = useVoiceRecorder()
  const [outage, setOutage] = useState(false)
  // 题目 TTS：真实调用云端 /speech/synthesize。状态如实反映当前链路；失败或未配置时
  // 转为 degraded，界面标注「不可用，已降级为纯文字」，题干文本始终保留。
  const [ttsStatus, setTtsStatus] = useState<"idle" | "loading" | "playing" | "degraded">("idle")
  const [ttsError, setTtsError] = useState<unknown>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)
  const [granted, setGranted] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<{ text: string; channel: "voice" | "text" } | null>(null)
  const [textAnswer, setTextAnswer] = useState("")
  const [capture, setCapture] = useState<{ durationSeconds: number; pauseCount: number } | null>(null)
  const [manualDuration, setManualDuration] = useState("")
  // 当前真正生效的链路与云端时间戳；界面据此如实标注，不混淆。
  const [channel, setChannel] = useState<SpeechChannel | null>(null)
  const [words, setWords] = useState<SpeechWord[] | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const [cloudDuration, setCloudDuration] = useState<number | null>(null)
  const [validation, setValidation] = useState("")
  const cloud = useCloudTranscription()

  const real = question != null
  const voiceSet = useMemo(() => new Set(voiceQuestionIds ?? []), [voiceQuestionIds])
  const priorQuestions = useMemo(() => {
    if (!session || !question) return []
    return session.questions.filter((item) => item.ordinal < question.ordinal)
  }, [session, question])
  const snapshot = session?.contextSnapshot

  const recording = recorder.status === "recording"
  const seconds = recording ? recorder.seconds : Math.round(capture?.durationSeconds ?? recorder.seconds)
  // 录音能力不可用或用户拒绝授权时，明确降级为手动输入文本 + 手填时长。
  const manualMode = !recorder.recorderAvailable || recorder.error === "permission_denied"

  // TTS 播报：音频只在内存里播放；URL 用完即 revoke，组件卸载 / 切题 / 故障演练时立即停止。
  const stopAudio = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.src = ""
    }
    audioRef.current = null
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [])

  useEffect(() => () => stopAudio(), [stopAudio])

  useEffect(() => {
    // 切题后旧音频不再对应当前题干，立即停止并回到未播报态。
    stopAudio()
    setTtsStatus("idle")
    setTtsError(null)
  }, [question?.id, stopAudio])

  const playQuestion = useCallback(async () => {
    if (outage) return
    const text = (question?.prompt ?? t("interviewVoice.turns.q2")).trim()
    if (!text) return
    if (ttsStatus === "playing") {
      stopAudio()
      setTtsStatus("idle")
      return
    }
    stopAudio()
    setTtsError(null)
    setTtsStatus("loading")
    try {
      const blob = await synthesizeSpeech({ text })
      const url = URL.createObjectURL(blob)
      audioUrlRef.current = url
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        stopAudio()
        setTtsStatus("idle")
      }
      audio.onerror = () => {
        // 音频拿到了但浏览器播放失败：同样降级为纯文字，不假装播报成功。
        stopAudio()
        setTtsError(new Error("tts playback failed"))
        setTtsStatus("degraded")
      }
      await audio.play()
      setTtsStatus("playing")
    } catch (cause) {
      stopAudio()
      setTtsError(cause)
      setTtsStatus("degraded")
    }
  }, [outage, question?.prompt, stopAudio, t, ttsStatus])

  const startRecording = () => {
    setDraft(null)
    setCapture(null)
    setValidation("")
    setChannel(null)
    setWords(null)
    setProvider(null)
    setCloudDuration(null)
    cloud.reset()
    void recorder.start()
  }
  const stopRecording = async () => {
    const answer = await recorder.stop()
    if (!answer) return
    setCapture({ durationSeconds: answer.durationSeconds, pauseCount: answer.pauseCount })
    // 先用浏览器转写兜底展示；云端结果回来后再覆盖，并如实标注用的是哪条链路。
    setDraft(answer.transcript)
    if (!answer.blob) {
      setChannel(recorder.asrAvailable ? "browser" : "manual")
      return
    }
    if (outage) {
      // 故障演练：显式跳过云端转写，只用浏览器识别 / 手动输入。
      setChannel(recorder.asrAvailable ? "browser" : "manual")
      return
    }
    const result = await cloud.transcribe(answer.blob, { languageHints: ["zh", "en"] })
    if (result) {
      setDraft(result.transcript)
      setWords(result.words)
      setProvider(result.provider)
      setCloudDuration(result.durationSeconds > 0 ? result.durationSeconds : null)
      setChannel("cloud")
    } else {
      setChannel(recorder.asrAvailable ? "browser" : "manual")
    }
  }
  const confirmDraft = () => {
    const text = (draft ?? "").trim()
    if (!text) {
      setValidation(t("interviewVoice.record.transcriptRequired"))
      return
    }
    const parsed = Number(manualDuration)
    const durationSeconds = cloudDuration ?? capture?.durationSeconds ?? (Number.isFinite(parsed) ? parsed : 0)
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      setValidation(t("interviewVoice.record.durationRequired"))
      return
    }
    setValidation("")
    const effectiveChannel = channel ?? (recorder.recorderAvailable ? "browser" : "manual")
    onRecorded?.({
      durationSeconds,
      transcript: text,
      pauseCount: capture?.pauseCount ?? 0,
      words: words ?? undefined,
      provider: provider ?? undefined,
      channel: effectiveChannel,
    })
    setConfirmed({ text, channel: "voice" })
    setDraft(null)
    setCapture(null)
    setManualDuration("")
    setWords(null)
    setProvider(null)
    setCloudDuration(null)
    setChannel(null)
    cloud.reset()
    recorder.reset()
  }
  const rerecord = () => {
    setConfirmed(null)
    setDraft(null)
    setCapture(null)
    setManualDuration("")
    setValidation("")
    setWords(null)
    setProvider(null)
    setCloudDuration(null)
    setChannel(null)
    cloud.reset()
    recorder.reset()
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
      available: !outage && recorder.asrAvailable,
      detailKey: outage
        ? "interviewVoice.panel.voice.asrDownDetail"
        : recorder.asrAvailable
          ? "interviewVoice.panel.voice.asrDetail"
          : "interviewVoice.record.asrUnavailable",
    },
    {
      key: "tts",
      icon: Volume2,
      // 故障演练或上一次播报失败后如实显示不可用，避免「看着可用其实播不出声」。
      available: !outage && ttsStatus !== "degraded",
      detailKey: outage
        ? "interviewVoice.panel.voice.ttsDownDetail"
        : ttsStatus === "degraded"
          ? "interviewVoice.panel.voice.ttsDegradedDetail"
          : "interviewVoice.panel.voice.ttsDetail",
    },
  ]

  const sessionRows = real && session
    ? [
        { label: t("interviewVoice.panel.session.role"), value: snapshot?.role || session.role },
        { label: t("interviewVoice.panel.session.jd"), value: snapshot?.jdRole ?? "" },
        { label: t("interviewVoice.panel.session.scale"), value: session.rubricVersion },
      ]
    : []
  const gapPoints = real ? question?.referencePoints ?? [] : []

  // 播报状态文案：云端播报成功 -> 云端播报；失败/未配置 -> 已降级为纯文字（含错误码映射）。
  const ttsStatusText = outage
    ? t("interviewVoice.header.outageBadge")
    : ttsStatus === "degraded"
      ? t("interviewVoice.question.ttsErrors." + ttsErrorCode(ttsError), {
          defaultValue: t("interviewVoice.question.ttsErrors.generic"),
        })
      : ttsStatus === "playing"
        ? t("interviewVoice.question.ttsCloud")
        : ttsStatus === "loading"
          ? t("interviewVoice.question.loading")
          : t("interviewVoice.question.hint")

  return (
    <div className="flex flex-col">
      <SectionHeader
        eyebrow={t("interviewVoice.meta.eyebrow")}
        title={
          real && snapshot
            ? t("interviewVoice.meta.answerTitle", { role: snapshot.role || session?.role || "" })
            : t("interviewVoice.meta.title")
        }
        description={real ? t("interviewVoice.meta.answerDescription") : t("interviewVoice.meta.description")}
        actions={
          <>
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
              >
                <ChevronLeft className="size-3.5" aria-hidden />
                {t("interviewVoice.header.back")}
              </button>
            ) : null}
            <button
              type="button"
              role="switch"
              aria-checked={outage}
              onClick={() => {
                // 切到故障演练态时立即退出语音链路：停播报、清云端转写结果，只保留文字输入。
                if (!outage) {
                  stopAudio()
                  setTtsStatus("idle")
                  setTtsError(null)
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
          </>
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
              {real ? (
                priorQuestions.map((item) => (
                  <Fragment key={item.id}>
                    <Bubble speaker="interviewer" channelText={item.prompt} />
                    {item.answer ? (
                      <Bubble
                        speaker="candidate"
                        voice={voiceSet.has(item.id)}
                        verified={voiceSet.has(item.id)}
                        channelText={item.answer.content}
                      />
                    ) : null}
                  </Fragment>
                ))
              ) : (
                PRIOR_TURNS.map((turn) => (
                  <Bubble
                    key={turn.id}
                    speaker={turn.speaker}
                    voice={turn.voice}
                    verified={turn.voice}
                    channelText={t(turn.textKey)}
                  />
                ))
              )}

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
                  <p className="wrap-anywhere mt-1.5 text-sm leading-relaxed text-card-foreground">
                    {question ? question.prompt : t("interviewVoice.turns.q2")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                    <button
                      type="button"
                      disabled={outage || ttsStatus === "loading"}
                      onClick={() => void playQuestion()}
                      className={
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium " +
                        (outage
                          ? "border-border bg-secondary text-muted-foreground"
                          : "border-cobalt/40 bg-cobalt/5 text-cobalt")
                      }
                    >
                      {ttsStatus === "playing" ? (
                        <Square className="size-3.5" aria-hidden />
                      ) : ttsStatus === "loading" ? (
                        <AudioLines className="size-3.5 animate-pulse" aria-hidden />
                      ) : (
                        <Play className="size-3.5" aria-hidden />
                      )}
                      {ttsStatus === "playing"
                        ? t("interviewVoice.question.playing")
                        : ttsStatus === "loading"
                          ? t("interviewVoice.question.loading")
                          : t("interviewVoice.question.play")}
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      {ttsStatusText}
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

            {real && question == null ? (
              <p className="mt-3 text-sm text-muted-foreground">{t("interviewVoice.question.noQuestion")}</p>
            ) : outage ? (
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
            ) : manualMode ? (
              <div className="mt-3">
                <p className="flex items-start gap-2 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-xs font-medium text-coral">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {recorder.error === "permission_denied"
                    ? t("interviewVoice.record.permissionDenied")
                    : t("interviewVoice.record.unsupported")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("interviewVoice.record.manualDurationHint")}
                </p>
                <label htmlFor="manual-duration" className="mt-2 block text-[11px] font-medium tracking-wide text-muted-foreground">
                  {t("interviewVoice.record.manualDurationLabel")}
                </label>
                <input
                  id="manual-duration"
                  type="number"
                  min={1}
                  value={manualDuration}
                  onChange={(event) => setManualDuration(event.target.value)}
                  className="mt-1 w-32 rounded-md border border-input bg-card px-2.5 py-1.5 text-sm text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <textarea
                  rows={3}
                  value={draft ?? ""}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("interviewVoice.record.transcriptPlaceholder")}
                  aria-label={t("interviewVoice.record.transcriptLabel")}
                  className="mt-2 w-full resize-none rounded-lg border border-input bg-card p-3 text-sm text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={confirmDraft}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CircleCheck className="size-4" aria-hidden />
                    {saving ? t("interviewVoice.answer.saving") : t("interviewVoice.record.confirm")}
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
                    {t("interviewVoice.record.recording")}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {formatTime(recorder.seconds)}
                  </span>
                </div>
                <div className="mt-3 flex h-8 items-center gap-1.5" aria-hidden>
                  {WAVE_BARS.map((bar, index) => (
                    <span key={index} className={"w-1.5 animate-pulse rounded-full bg-coral " + bar} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => void stopRecording()}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-coral bg-card px-4 py-2 text-sm font-medium text-coral"
                >
                  <Square className="size-4" aria-hidden />
                  {t("interviewVoice.record.stop")}
                </button>
              </div>
            ) : draft !== null ? (
              <div className="mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-cobalt">
                    <AudioLines className="size-3.5" aria-hidden />
                    {t("interviewVoice.record.transcriptLabel")}
                  </p>
                  <span className="flex flex-wrap items-center gap-2">
                    {channel ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                        {t("interviewVoice.asr.channelLabel")} · {t("interviewVoice.asr.channel." + channel)}
                      </span>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      {t("interviewVoice.record.durationLabel")} · {t("interviewVoice.record.durationValue", { seconds })}
                    </p>
                  </span>
                </div>
                {cloud.pending ? (
                  <p className="mt-2 text-xs text-muted-foreground">{t("interviewVoice.asr.transcribing")}</p>
                ) : null}
                {!cloud.pending && cloud.error ? (
                  <p className="mt-2 flex items-start gap-2 rounded-lg border-l-2 border-gold bg-secondary px-3 py-1.5 text-xs leading-5 text-secondary-foreground">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                    <span>
                      {t("interviewVoice.asr.cloudFailed", { fallback: t("interviewVoice.asr.channel." + (channel ?? "manual")) })}{" "}
                      {t("interviewVoice.asr.errors." + speechErrorCode(cloud.error), {
                        defaultValue: t("interviewVoice.asr.errors.generic"),
                      })}
                    </span>
                  </p>
                ) : null}
                {recorder.asrAvailable ? null : (
                  <p className="mt-2 flex items-start gap-2 rounded-lg border-l-2 border-gold bg-secondary px-3 py-1.5 text-xs leading-5 text-secondary-foreground">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                    {t("interviewVoice.record.asrUnavailable")}
                  </p>
                )}
                <textarea
                  rows={3}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    recorder.setTranscript(event.target.value)
                  }}
                  placeholder={t("interviewVoice.record.transcriptPlaceholder")}
                  aria-label={t("interviewVoice.record.transcriptLabel")}
                  className="mt-2 w-full resize-none rounded-lg border border-input bg-card p-3 text-sm text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={confirmDraft}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CircleCheck className="size-4" aria-hidden />
                    {saving ? t("interviewVoice.answer.saving") : t("interviewVoice.record.confirm")}
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
                  {t("interviewVoice.record.start")}
                </button>
                <p className="text-xs text-muted-foreground">{t("interviewVoice.answer.ready.hint")}</p>
              </div>
            )}

            {validation ? (
              <p role="alert" className="mt-3 text-xs text-coral">
                {validation}
              </p>
            ) : null}
            {error ? (
              <div className="mt-3">
                <InterviewErrorNotice title={t("interviewVoice.answer.submitError")} cause={error} />
              </div>
            ) : null}
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
                      <p className="wrap-anywhere mt-0.5 text-xs text-muted-foreground">{t(row.detailKey)}</p>
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
              {real
                ? sessionRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-3 py-1.5 text-xs"
                    >
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="wrap-anywhere text-right font-medium text-card-foreground">{row.value}</dd>
                    </div>
                  ))
                : SESSION_ROWS.map((row) => (
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
              {real ? (
                gapPoints.length === 0 ? (
                  <li className="text-xs text-muted-foreground">{t("interviewVoice.panel.gaps.empty")}</li>
                ) : (
                  gapPoints.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-card-foreground"
                    >
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                      <span className="wrap-anywhere">{point}</span>
                    </li>
                  ))
                )
              ) : (
                GAP_KEYS.map((key) => (
                  <li
                    key={key}
                    className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-card-foreground"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-coral" aria-hidden />
                    <span>{t(key)}</span>
                  </li>
                ))
              )}
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
