// 语音作答指标的数据访问（Issue b404e / 云端 ASR 接入）：真实请求后端
// /speech/segments 与 /speech/transcribe。请求统一走 api-client；字段名与后端
// camelCase 一致，不做本地改名。

import { request, requestBlobWithResponse } from "@/lib/api-client"

/** 清晰度等级：由服务端按填充词率 + 停顿率折算，无法测量时为空。 */
export type ClarityLevel = "good" | "fair" | "needs_work"

/** 语速/停顿的口径来源：云端时间戳（timestamps）或字数 ÷ 录音时长（duration）。 */
export type SpeechTimingSource = "timestamps" | "duration"

/** 一个词级/句级时间戳单元；begin/end 相对音频开头，单位毫秒。 */
export interface SpeechWord {
  text: string
  beginMs: number
  endMs: number
}

export interface SpeechSegmentInput {
  /** 由浏览器 MediaRecorder 计时得出的真实时长（秒），必须 > 0。 */
  durationSeconds: number
  /** 真实转写文本；录音成功但无转写时允许为空。 */
  transcript: string
  sessionId?: string
  questionId?: string
  /** 浏览器 Web Audio 静音检测到的停顿次数；未测到就不传。 */
  pauseCount?: number
  /** 云端 ASR 返回的词/句级时间戳；有它时服务端用真实时间戳算语速与停顿。 */
  words?: SpeechWord[]
  /** 本次转写的服务商（如 dashscope）；浏览器转写/手动输入不传。 */
  provider?: string
}

export interface SpeechSegmentView {
  id: string
  sessionId: string | null
  questionId: string | null
  durationSeconds: number
  transcript: string
  charCount: number
  paceCharsPerMin: number | null
  fillerCount: number
  pauseCount: number | null
  clarityScore: number | null
  clarityLevel: ClarityLevel | null
  provider: string | null
  timingSource: SpeechTimingSource | null
  speechDurationSeconds: number | null
  createdAt: string
}

/** POST /speech/segments —— 落一段真实录音作答的指标并读回服务端计算结果。 */
export function createSpeechSegment(input: SpeechSegmentInput): Promise<SpeechSegmentView> {
  return request<SpeechSegmentView>("/speech/segments", { method: "POST", body: JSON.stringify(input) })
}

/** GET /speech/segments?sessionId= —— 按会话读回已落库的真实录音指标。 */
export function listSpeechSegments(sessionId: string): Promise<SpeechSegmentView[]> {
  return request<SpeechSegmentView[]>("/speech/segments?sessionId=" + encodeURIComponent(sessionId))
}

/** 云端 ASR 结果：转写、总时长、可选的词/句级时间戳与服务商。 */
export interface SpeechTranscription {
  transcript: string
  durationSeconds: number
  words: SpeechWord[] | null
  provider: string
}

export interface TranscribeSpeechInput {
  /** MediaRecorder 产出的录音 Blob；只上传一次，后端不落盘。 */
  audio: Blob
  contentType?: string
  filename?: string
  languageHints?: string[]
}

/** 把二进制音频编成 base64（分块拼接，避免超长参数把调用栈打爆）。 */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ""
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

/**
 * POST /speech/transcribe —— 云端 Paraformer 识别。
 * 音频走 base64 JSON（后端无 python-multipart 依赖，且单题作答音频很小）；
 * 未配置 Key 时后端返回 MODEL_NOT_CONFIGURED，调用方据此回退浏览器识别。
 */
export async function transcribeSpeech(input: TranscribeSpeechInput): Promise<SpeechTranscription> {
  const audioBase64 = await blobToBase64(input.audio)
  return request<SpeechTranscription>("/speech/transcribe", {
    method: "POST",
    body: JSON.stringify({
      audioBase64,
      contentType: input.contentType ?? input.audio.type ?? undefined,
      filename: input.filename,
      languageHints: input.languageHints,
    }),
  })
}

/** 云端 TTS 合成入参；format 目前只支持 wav。 */
export interface SynthesizeSpeechInput {
  /** 要播报的题干文本；为空时前端不应发起请求。 */
  text: string
  voice?: string
  format?: "wav"
}

/**
 * POST /speech/synthesize —— 云端题目播报。
 * 服务端取回带签名的临时音频并回传二进制，浏览器只拿到音频 Blob、拿不到临时 URL；
 * 未配置 Key 时后端返回 MODEL_NOT_CONFIGURED，调用方据此降级为纯文字。
 */
export async function synthesizeSpeech(input: SynthesizeSpeechInput): Promise<Blob> {
  const { blob } = await requestBlobWithResponse("/speech/synthesize", {
    method: "POST",
    body: JSON.stringify({ text: input.text, voice: input.voice, format: input.format }),
  })
  return blob
}
