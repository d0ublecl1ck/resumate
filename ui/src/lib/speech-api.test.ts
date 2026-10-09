// 录音上传路径：Blob -> base64 JSON -> POST /speech/transcribe（MSW 契约）。
// 覆盖成功返回时间戳、以及未配置 Key 时的可区分错误码（供界面回退浏览器识别）。
import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { ApiRequestError } from "@/lib/api-client"
import { transcribeSpeech } from "@/lib/speech-api"
import { server } from "@/test-server"

function audioBlob(): Blob {
  return new Blob([new Uint8Array([104, 105])], { type: "audio/webm" })
}

describe("transcribeSpeech", () => {
  it("把录音按 base64 上传并返回云端转写与时间戳", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.post("/api/speech/transcribe", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          transcript: "云端转写",
          durationSeconds: 3.2,
          words: [{ text: "云端", beginMs: 0, endMs: 1000 }],
          provider: "dashscope",
        })
      }),
    )

    const result = await transcribeSpeech({
      audio: audioBlob(),
      filename: "answer.webm",
      languageHints: ["zh", "en"],
    })

    expect(result.transcript).toBe("云端转写")
    expect(result.provider).toBe("dashscope")
    expect(result.words).toEqual([{ text: "云端", beginMs: 0, endMs: 1000 }])
    // btoa("hi") = "aGk="，证明二进制确实是按 base64 走的。
    expect(body?.audioBase64).toBe("aGk=")
    expect(body?.contentType).toBe("audio/webm")
    expect(body?.filename).toBe("answer.webm")
    expect(body?.languageHints).toEqual(["zh", "en"])
  })

  it("未配置 Key 时抛出 MODEL_NOT_CONFIGURED，调用方可据此回退", async () => {
    server.use(
      http.post("/api/speech/transcribe", () =>
        HttpResponse.json({ code: "MODEL_NOT_CONFIGURED", message: "还没有配置语音识别 API Key" }, { status: 409 }),
      ),
    )

    await expect(transcribeSpeech({ audio: audioBlob() })).rejects.toMatchObject({
      code: "MODEL_NOT_CONFIGURED",
    } satisfies Partial<ApiRequestError>)
  })
})
