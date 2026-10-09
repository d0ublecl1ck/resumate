// 云端语音识别（Paraformer）的调用与降级选择。
//
// 链路优先级：云端识别（后端调 ASR）> 浏览器 SpeechRecognition > 手动输入。
// 云端不可用（未配置 Key / 上游拒绝 / 超时 / 网络失败）时**不抛给用户**，而是
// 返回 null 并保留 error，由界面如实标注当前真正用的是哪条链路。

import { useCallback, useState } from "react"

import { transcribeSpeech } from "@/lib/speech-api"
import type { SpeechTranscription } from "@/lib/speech-api"

/** 当前实际生效的语音作答链路。 */
export type SpeechChannel = "cloud" | "browser" | "manual"

export interface CloudTranscription {
  pending: boolean
  result: SpeechTranscription | null
  error: unknown
  /** 成功返回结果；失败返回 null（把 error 交给界面做 i18n 映射）。 */
  transcribe: (
    audio: Blob,
    options?: { filename?: string; languageHints?: string[] },
  ) => Promise<SpeechTranscription | null>
  reset: () => void
}

export function useCloudTranscription(): CloudTranscription {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<SpeechTranscription | null>(null)
  const [error, setError] = useState<unknown>(null)

  const transcribe = useCallback<CloudTranscription["transcribe"]>(async (audio, options) => {
    setPending(true)
    setError(null)
    try {
      const transcription = await transcribeSpeech({
        audio,
        filename: options?.filename,
        languageHints: options?.languageHints,
      })
      setResult(transcription)
      return transcription
    } catch (cause) {
      setError(cause)
      setResult(null)
      return null
    } finally {
      setPending(false)
    }
  }, [])

  const reset = useCallback(() => {
    setPending(false)
    setResult(null)
    setError(null)
  }, [])

  return { pending, result, error, transcribe, reset }
}
