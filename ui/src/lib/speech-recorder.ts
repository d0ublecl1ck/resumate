// 浏览器语音采集（Issue b404e）：MediaRecorder 真实录音 + 计时 + Web Audio 静音停顿检测
// + SpeechRecognition 实时转写。链路不可用时由调用方明确降级，绝不伪造指标。
//
// 原始音频只在本机内存里停留（blobBytes 仅用于证明确实录到了字节），不上传后端。

import { useCallback, useEffect, useRef, useState } from "react"

export type RecorderStatus = "idle" | "recording"

/** 一次真实录音的结果；transcript 为空表示未取到转写（降级为手动输入）。 */
export interface RecordedAnswer {
  durationSeconds: number
  transcript: string
  pauseCount: number
  /** 本次录音累积到的音频字节数；0 表示没有真实音频。 */
  blobBytes: number
  /** 真实录音 Blob；null 表示没有可上传的音频（降级为手动输入）。 */
  blob: Blob | null
}

interface SpeechRecognitionAlternativeLike {
  transcript: string
}
interface SpeechRecognitionResultLike {
  readonly length: number
  readonly isFinal: boolean
  readonly [index: number]: SpeechRecognitionAlternativeLike
}
interface SpeechRecognitionResultListLike {
  readonly length: number
  readonly [index: number]: SpeechRecognitionResultLike
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultListLike
}
interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

// Web Audio 采样口径：RMS 低于阈值视为静音；连续静音 ≥ 600ms 记为一次停顿。
const SILENCE_RMS = 0.012
const PAUSE_MIN_MS = 600
const SAMPLE_INTERVAL_MS = 100
// 录音最少按 0.1 秒计，避免极短录制成 0 导致后端拒绝。
const MIN_DURATION_SECONDS = 0.1

function speechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null
  const scope = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  return scope.AudioContext ?? scope.webkitAudioContext ?? null
}

/** 浏览器是否提供 SpeechRecognition（Chrome 可用；不可用时降级为手动输入）。 */
export function isSpeechRecognitionSupported(): boolean {
  return speechRecognitionCtor() !== null
}

/** 浏览器是否具备 MediaRecorder + getUserMedia 的真实录音能力。 */
export function isMediaRecorderSupported(): boolean {
  if (typeof navigator === "undefined" || typeof MediaRecorder === "undefined") return false
  return typeof navigator.mediaDevices?.getUserMedia === "function"
}

export interface VoiceRecorder {
  status: RecorderStatus
  /** 真实录音已进行的整秒数，驱动界面计时。 */
  seconds: number
  transcript: string
  /** 录音结束后回填的真实时长（秒）；用于降级为手动输入时预填。 */
  lastDurationSeconds: number
  /** 本次录音测到的停顿次数，提交时随指标一起落库。 */
  lastPauseCount: number
  lastBlobBytes: number
  /** 最近一次录音的 Blob，供上传云端 ASR；未录到音频时为 null。 */
  lastBlob: Blob | null
  /** 当前运行环境是否支持实时转写。 */
  asrAvailable: boolean
  /** 当前运行环境是否支持真实录音。 */
  recorderAvailable: boolean
  error: string | null
  start: () => Promise<void>
  /** 停止录音并在 MediaRecorder 收尾后解析出完整结果（含音频 Blob）。 */
  stop: () => Promise<RecordedAnswer | null>
  reset: () => void
  setTranscript: (value: string) => void
}

export function useVoiceRecorder(): VoiceRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscriptState] = useState("")
  const [lastDurationSeconds, setLastDurationSeconds] = useState(0)
  const [lastPauseCount, setLastPauseCount] = useState(0)
  const [lastBlobBytes, setLastBlobBytes] = useState(0)
  const [lastBlob, setLastBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [recorderAvailable] = useState(() => isMediaRecorderSupported())
  const [asrAvailable] = useState(() => isSpeechRecognitionSupported())

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const finalTranscriptRef = useRef("")
  const interimTranscriptRef = useRef("")
  const pauseCountRef = useRef(0)
  const silentMsRef = useRef(0)
  const hasSpokenRef = useRef(false)
  const inPauseRef = useRef(false)
  const sampleTimerRef = useRef<number | null>(null)
  const clockTimerRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (sampleTimerRef.current !== null) {
      window.clearInterval(sampleTimerRef.current)
      sampleTimerRef.current = null
    }
    if (clockTimerRef.current !== null) {
      window.clearInterval(clockTimerRef.current)
      clockTimerRef.current = null
    }
  }, [])

  useEffect(() => clearTimers, [clearTimers])

  const sampleLevel = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const frame = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(frame)
    let sum = 0
    for (const value of frame) sum += value * value
    const rms = Math.sqrt(sum / frame.length)
    if (rms >= SILENCE_RMS) {
      hasSpokenRef.current = true
      silentMsRef.current = 0
      inPauseRef.current = false
      return
    }
    if (!hasSpokenRef.current) return
    silentMsRef.current += SAMPLE_INTERVAL_MS
    if (!inPauseRef.current && silentMsRef.current >= PAUSE_MIN_MS) {
      inPauseRef.current = true
      pauseCountRef.current += 1
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setTranscriptState("")
    setSeconds(0)
    setLastDurationSeconds(0)
    setLastPauseCount(0)
    setLastBlobBytes(0)
    setLastBlob(null)
    finalTranscriptRef.current = ""
    interimTranscriptRef.current = ""
    pauseCountRef.current = 0
    silentMsRef.current = 0
    hasSpokenRef.current = false
    inPauseRef.current = false
    chunksRef.current = []

    if (!isMediaRecorderSupported()) {
      setError("unsupported")
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError("permission_denied")
      return
    }
    streamRef.current = stream

    const recorder = new MediaRecorder(stream)
    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    // 分片触发 dataavailable，保证停止时已累计到真实字节数。
    recorder.start(200)
    mediaRecorderRef.current = recorder

    const AudioCtor = audioContextCtor()
    if (AudioCtor) {
      try {
        const context = new AudioCtor()
        const analyser = context.createAnalyser()
        analyser.fftSize = 2048
        context.createMediaStreamSource(stream).connect(analyser)
        audioContextRef.current = context
        analyserRef.current = analyser
        sampleTimerRef.current = window.setInterval(sampleLevel, SAMPLE_INTERVAL_MS)
      } catch {
        analyserRef.current = null
      }
    }

    const Recognition = speechRecognitionCtor()
    if (Recognition) {
      try {
        const recognition = new Recognition()
        recognition.lang = typeof document === "undefined" ? "zh-CN" : document.documentElement.lang || "zh-CN"
        recognition.continuous = true
        recognition.interimResults = true
        recognition.onresult = (event) => {
          let interim = ""
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index]
            const text = result[0]?.transcript ?? ""
            if (result.isFinal) finalTranscriptRef.current += text
            else interim += text
          }
          interimTranscriptRef.current = interim
          setTranscriptState((finalTranscriptRef.current + interim).trim())
        }
        recognition.onerror = () => undefined
        recognition.onend = () => undefined
        recognition.start()
        recognitionRef.current = recognition
      } catch {
        recognitionRef.current = null
      }
    }

    startedAtRef.current = performance.now()
    clockTimerRef.current = window.setInterval(() => {
      setSeconds(Math.floor((performance.now() - startedAtRef.current) / 1000))
    }, 250)
    setStatus("recording")
  }, [sampleLevel])

  const stop = useCallback((): Promise<RecordedAnswer | null> => {
    const recorder = mediaRecorderRef.current
    if (!recorder || status !== "recording") return Promise.resolve(null)

    const durationSeconds = Math.max(MIN_DURATION_SECONDS, (performance.now() - startedAtRef.current) / 1000)
    clearTimers()
    try {
      recognitionRef.current?.stop()
    } catch {
      // 识别器已结束时 stop 会抛错，忽略即可。
    }
    recognitionRef.current = null
    mediaRecorderRef.current = null

    const text = (finalTranscriptRef.current + interimTranscriptRef.current).trim()
    const pauseCount = pauseCountRef.current
    setTranscriptState(text)
    setSeconds(Math.round(durationSeconds))
    setLastDurationSeconds(durationSeconds)
    setLastPauseCount(pauseCount)
    setStatus("idle")

    return new Promise<RecordedAnswer>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        const audio = blob.size > 0 ? blob : null
        setLastBlob(audio)
        setLastBlobBytes(blob.size)
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        void audioContextRef.current?.close()
        audioContextRef.current = null
        analyserRef.current = null
        resolve({ durationSeconds, transcript: text, pauseCount, blobBytes: blob.size, blob: audio })
      }
      // 停止事件异步到达；onerror 与兜底定时器保证不会永久挂起等待。
      recorder.onstop = finish
      recorder.onerror = finish
      if (recorder.state !== "inactive") recorder.stop()
      window.setTimeout(finish, 2000)
    })
  }, [clearTimers, status])

  const reset = useCallback(() => {
    clearTimers()
    setTranscriptState("")
    setSeconds(0)
    setLastDurationSeconds(0)
    setLastPauseCount(0)
    setLastBlobBytes(0)
    setLastBlob(null)
    setError(null)
    finalTranscriptRef.current = ""
    interimTranscriptRef.current = ""
  }, [clearTimers])

  const setTranscript = useCallback((value: string) => {
    // 手动编辑转写后，停止时也要以编辑后的文本为准。
    finalTranscriptRef.current = value
    interimTranscriptRef.current = ""
    setTranscriptState(value)
  }, [])

  return {
    status,
    seconds,
    transcript,
    lastDurationSeconds,
    lastPauseCount,
    lastBlobBytes,
    lastBlob,
    asrAvailable,
    recorderAvailable,
    error,
    start,
    stop,
    reset,
    setTranscript,
  }
}
