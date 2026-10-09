// 表达维度聚合：把同一会话的多段真实录音指标汇总成一个可展示的摘要。
// 纯函数、无副作用，便于 vitest 覆盖「无音频 -> 不适用」的分支。
//
// 诚实底线：这里不产生任何数字。语速由总字数 / 总时长的真实输入复算，
// 清晰度等级由各段服务端 clarityScore 按时长加权平均后落档；没有音频就返回空值。

import type { ClarityLevel, SpeechSegmentView, SpeechTimingSource } from "@/lib/speech-api"

export interface ExpressionSummary {
  /** 是否存在真实录音记录；false 时报告表达维度显示「不适用」。 */
  hasAudio: boolean
  segmentCount: number
  durationSeconds: number
  charCount: number
  /** 由真实字数与真实时长复算出的语速（字/分）；无法测量时为空。 */
  paceCharsPerMin: number | null
  clarityLevel: ClarityLevel | null
  clarityScore: number | null
  fillerCount: number
  /** 各段停顿次数之和；全部未测到时为 null。 */
  pauseCount: number | null
  /**
   * 语速/停顿的口径来源：全部来自云端时间戳 = timestamps，全部来自字数 ÷ 时长 =
   * duration，两种都有 = mixed；无任何记录时为 null。报告据此如实标注。
   * 可选：旧的数据夹具可以不带来源。
   */
  timingSource?: SpeechTimingSource | "mixed" | null
}

export const EMPTY_EXPRESSION: ExpressionSummary = {
  hasAudio: false,
  segmentCount: 0,
  durationSeconds: 0,
  charCount: 0,
  paceCharsPerMin: null,
  clarityLevel: null,
  clarityScore: null,
  fillerCount: 0,
  pauseCount: null,
  timingSource: null,
}

// 与服务端 speech/service.py 的折算口径保持一致（good >= 80，fair >= 60）。
export const CLARITY_GOOD_MIN = 80
export const CLARITY_FAIR_MIN = 60

export function clarityLevelFromScore(score: number | null): ClarityLevel | null {
  if (score === null) return null
  if (score >= CLARITY_GOOD_MIN) return "good"
  if (score >= CLARITY_FAIR_MIN) return "fair"
  return "needs_work"
}

/**
 * 汇总一段会话的全部语音指标。
 * - 语速 = 总字数 / 总时长（分钟）；总字数为 0 或总时长非正时为空，而不是 0。
 * - 清晰度 = 有 clarityScore 的段落按时长加权平均后落档；没有则为空。
 */
export function summarizeExpression(segments: SpeechSegmentView[]): ExpressionSummary {
  if (segments.length === 0) return { ...EMPTY_EXPRESSION }

  const charCount = segments.reduce((sum, item) => sum + item.charCount, 0)
  const durationSeconds = segments.reduce((sum, item) => sum + item.durationSeconds, 0)
  const fillerCount = segments.reduce((sum, item) => sum + item.fillerCount, 0)

  // 语速分母优先用云端时间戳给出的「发声跨度」，没有时才退回录音总时长。
  const effectiveDuration = segments.reduce(
    (sum, item) => sum + (item.speechDurationSeconds ?? item.durationSeconds),
    0,
  )
  const paceCharsPerMin = charCount > 0 && effectiveDuration > 0 ? Math.round((charCount * 60) / effectiveDuration) : null

  const sources = new Set(
    segments
      .map((item) => item.timingSource)
      .filter((value): value is SpeechTimingSource => value === "timestamps" || value === "duration"),
  )
  const timingSource: ExpressionSummary["timingSource"] =
    sources.size === 0 ? null : sources.size === 1 ? [...sources][0] : "mixed"

  const scored = segments.filter((item) => item.clarityScore !== null)
  const scoredDuration = scored.reduce((sum, item) => sum + item.durationSeconds, 0)
  let clarityScore: number | null = null
  if (scored.length > 0 && scoredDuration > 0) {
    const weighted = scored.reduce((sum, item) => sum + (item.clarityScore as number) * item.durationSeconds, 0)
    clarityScore = Math.round(weighted / scoredDuration)
  } else if (scored.length > 0) {
    const average = scored.reduce((sum, item) => sum + (item.clarityScore as number), 0) / scored.length
    clarityScore = Math.round(average)
  }

  const pauseValues = segments.map((item) => item.pauseCount).filter((value): value is number => value !== null)

  return {
    hasAudio: true,
    segmentCount: segments.length,
    durationSeconds,
    charCount,
    paceCharsPerMin,
    clarityLevel: clarityLevelFromScore(clarityScore),
    clarityScore,
    fillerCount,
    pauseCount: pauseValues.length > 0 ? pauseValues.reduce((sum, value) => sum + value, 0) : null,
    timingSource,
  }
}
