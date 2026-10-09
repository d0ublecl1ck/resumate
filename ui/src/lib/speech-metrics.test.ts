// 表达维度聚合的纯函数：空输入 -> 全部「不适用」；有真实输入 -> 按总量复算，不落 0。
import { describe, expect, it } from "vitest"
import type { SpeechSegmentView } from "@/lib/speech-api"
import { clarityLevelFromScore, summarizeExpression } from "@/lib/speech-metrics"

function segment(overrides: Partial<SpeechSegmentView>): SpeechSegmentView {
  return {
    id: "spg_1",
    sessionId: "ivs_1",
    questionId: "ivq_1",
    durationSeconds: 60,
    transcript: "x",
    charCount: 128,
    paceCharsPerMin: 128,
    fillerCount: 0,
    pauseCount: 0,
    clarityScore: 90,
    clarityLevel: "good",
    provider: null,
    timingSource: "duration",
    speechDurationSeconds: null,
    createdAt: "2026-10-09T12:00:00+00:00",
    ...overrides,
  }
}

describe("summarizeExpression", () => {
  it("没有音频记录时全部为空值，报告才能显示不适用", () => {
    const summary = summarizeExpression([])

    expect(summary.hasAudio).toBe(false)
    expect(summary.paceCharsPerMin).toBeNull()
    expect(summary.clarityLevel).toBeNull()
    expect(summary.pauseCount).toBeNull()
  })

  it("有真实记录时用总字数/总时长复算语速", () => {
    const summary = summarizeExpression([
      segment({ id: "a", durationSeconds: 30, charCount: 60, clarityScore: 90, pauseCount: 2 }),
      segment({ id: "b", durationSeconds: 30, charCount: 40, clarityScore: 60, pauseCount: 4 }),
    ])

    expect(summary.hasAudio).toBe(true)
    expect(summary.charCount).toBe(100)
    expect(summary.durationSeconds).toBe(60)
    expect(summary.paceCharsPerMin).toBe(100)
    expect(summary.pauseCount).toBe(6)
    // 清晰度按时长加权平均：(90+60)/2 = 75 -> fair。
    expect(summary.clarityScore).toBe(75)
    expect(summary.clarityLevel).toBe("fair")
  })

  it("时间戳口径下用发声跨度复算语速并标注来源", () => {
    const summary = summarizeExpression([
      segment({ id: "a", durationSeconds: 30, speechDurationSeconds: 20, charCount: 60, timingSource: "timestamps" }),
      segment({ id: "b", durationSeconds: 30, speechDurationSeconds: 30, charCount: 30, timingSource: "timestamps" }),
    ])

    // (60 + 30) 字 / (20 + 30) 秒 = 108 字/分，分母是发声跨度而不是 60 秒录音时长。
    expect(summary.paceCharsPerMin).toBe(108)
    expect(summary.timingSource).toBe("timestamps")
  })

  it("混合口径标注为 mixed", () => {
    const summary = summarizeExpression([
      segment({ id: "a", timingSource: "timestamps", speechDurationSeconds: 30 }),
      segment({ id: "b", timingSource: "duration", speechDurationSeconds: null }),
    ])

    expect(summary.timingSource).toBe("mixed")
  })

  it("空转写不会伪造 0 字/分", () => {
    const summary = summarizeExpression([segment({ charCount: 0, paceCharsPerMin: null, clarityScore: null, clarityLevel: null })])

    expect(summary.hasAudio).toBe(true)
    expect(summary.paceCharsPerMin).toBeNull()
    expect(summary.clarityLevel).toBeNull()
  })

  it("清晰度分落档边界与服务端口径一致", () => {
    expect(clarityLevelFromScore(80)).toBe("good")
    expect(clarityLevelFromScore(79)).toBe("fair")
    expect(clarityLevelFromScore(60)).toBe("fair")
    expect(clarityLevelFromScore(59)).toBe("needs_work")
    expect(clarityLevelFromScore(null)).toBeNull()
  })
})
