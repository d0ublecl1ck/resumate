// 录音作答的云端优先链路：MediaRecorder 桩 -> 上传 -> 云端转写 -> 确认回传时间戳。
// 云端不可用时必须回退到浏览器转写，并在界面上如实标注当前链路。
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { VoiceScreen } from "@/features/interview/voice-screen"
import { server } from "@/test-server"

vi.mock("@/lib/speech-recorder", async () => {
  const { useCallback, useState } = await import("react")
  const blob = new Blob([new Uint8Array([104, 105])], { type: "audio/webm" })
  return {
    useVoiceRecorder: () => {
      const [status, setStatus] = useState<"idle" | "recording">("idle")
      const [transcript, setTranscript] = useState("")
      const start = useCallback(async () => setStatus("recording"), [])
      const stop = useCallback(async () => {
        setStatus("idle")
        return { durationSeconds: 6.5, transcript: "浏览器转写", pauseCount: 2, blobBytes: blob.size, blob }
      }, [])
      const reset = useCallback(() => {
        setStatus("idle")
        setTranscript("")
      }, [])
      return {
        status,
        seconds: 0,
        transcript,
        lastDurationSeconds: 6.5,
        lastPauseCount: 2,
        lastBlobBytes: blob.size,
        lastBlob: null,
        asrAvailable: true,
        recorderAvailable: true,
        error: null,
        start,
        stop,
        reset,
        setTranscript,
      }
    },
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function recordOnce() {
  fireEvent.click(screen.getByRole("button", { name: "允许使用麦克风" }))
  fireEvent.click(screen.getByRole("button", { name: "开始录音" }))
  fireEvent.click(screen.getByRole("button", { name: "结束录音" }))
}

describe("VoiceScreen 云端识别链路", () => {
  it("云端可用时用云端转写并标注「云端识别」，确认回传时间戳", async () => {
    server.use(
      http.post("/api/speech/transcribe", () =>
        HttpResponse.json({
          transcript: "云端转写文本",
          durationSeconds: 6.4,
          words: [{ text: "云端", beginMs: 0, endMs: 900 }],
          provider: "dashscope",
        }),
      ),
    )
    const onRecorded = vi.fn()
    render(<VoiceScreen onRecorded={onRecorded} />)

    recordOnce()

    expect(await screen.findByText(/当前链路 · 云端识别/)).toBeInTheDocument()
    expect((screen.getByRole("textbox", { name: "转写文本（可编辑）" }) as HTMLTextAreaElement).value).toBe("云端转写文本")

    fireEvent.click(screen.getByRole("button", { name: "确认并提交" }))
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    expect(onRecorded).toHaveBeenCalledWith({
      durationSeconds: 6.4,
      transcript: "云端转写文本",
      pauseCount: 2,
      words: [{ text: "云端", beginMs: 0, endMs: 900 }],
      provider: "dashscope",
      channel: "cloud",
    })
  })

  it("云端未配置时回退浏览器转写并如实标注，不下发时间戳", async () => {
    server.use(
      http.post("/api/speech/transcribe", () =>
        HttpResponse.json({ code: "MODEL_NOT_CONFIGURED", message: "还没有配置语音识别 API Key" }, { status: 409 }),
      ),
    )
    const onRecorded = vi.fn()
    render(<VoiceScreen onRecorded={onRecorded} />)

    recordOnce()

    expect(await screen.findByText(/当前链路 · 浏览器识别/)).toBeInTheDocument()
    // 错误码映射成中文 i18n 文案，且不出现后端原始 message。
    expect(screen.getByText(/还没有配置语音识别 API Key，已改用浏览器识别/)).toBeInTheDocument()
    expect(screen.queryByText("还没有配置语音识别 API Key")).not.toBeInTheDocument()
    expect((screen.getByRole("textbox", { name: "转写文本（可编辑）" }) as HTMLTextAreaElement).value).toBe("浏览器转写")

    fireEvent.click(screen.getByRole("button", { name: "确认并提交" }))
    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1))
    const answer = onRecorded.mock.calls[0][0]
    expect(answer.channel).toBe("browser")
    expect(answer.words).toBeUndefined()
    expect(answer.provider).toBeUndefined()
  })
})

describe("VoiceScreen 题目播报（TTS）", () => {
  function mockAudio() {
    const play = vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
    const pause = vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:tts"), configurable: true, writable: true })
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true, writable: true })
    return { play, pause }
  }

  it("云端播报成功时请求 /speech/synthesize 并标注「云端播报」", async () => {
    const { play } = mockAudio()
    let requestPath = ""
    server.use(
      http.post("/api/speech/synthesize", ({ request }) => {
        requestPath = new URL(request.url).pathname
        return new HttpResponse(new Blob([new Uint8Array([82, 73, 70, 70])], { type: "audio/wav" }), {
          status: 200,
          headers: { "Content-Type": "audio/wav" },
        })
      }),
    )

    render(<VoiceScreen />)
    fireEvent.click(screen.getByRole("button", { name: "播放题目（TTS）" }))

    expect(await screen.findByText("云端播报")).toBeInTheDocument()
    expect(requestPath).toBe("/api/speech/synthesize")
    expect(play).toHaveBeenCalledTimes(1)
  })

  it("云端未配置时降级为纯文字，且不直出服务端 message", async () => {
    mockAudio()
    server.use(
      http.post("/api/speech/synthesize", () =>
        HttpResponse.json(
          { code: "MODEL_NOT_CONFIGURED", message: "raw-backend-tts-message-should-not-leak" },
          { status: 409 },
        ),
      ),
    )

    render(<VoiceScreen />)
    fireEvent.click(screen.getByRole("button", { name: "播放题目（TTS）" }))

    expect(await screen.findByText(/还没有配置语音服务 API Key，云端播报不可用/)).toBeInTheDocument()
    expect(screen.getByText(/已降级为纯文字，上下文完整保留/)).toBeInTheDocument()
    expect(screen.queryByText(/raw-backend-tts-message-should-not-leak/)).not.toBeInTheDocument()
  })

  it("打开「模拟语音服务不可用」后播放按钮禁用并标注故障演练", () => {
    mockAudio()
    render(<VoiceScreen />)

    fireEvent.click(screen.getByRole("switch", { name: "模拟语音服务不可用" }))

    expect(screen.getByRole("button", { name: "播放题目（TTS）" })).toBeDisabled()
    expect(screen.getAllByText("故障演练中：已跳过云端转写与云端播报").length).toBeGreaterThan(0)
  })
})
