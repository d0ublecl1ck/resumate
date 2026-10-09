// 设置页「语音识别」配置区：Key 加密提交、不回显、测试凭据走 i18n / 业务原文。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"

import { SettingsForm } from "@/components/settings-form"
import { AGENT_CONFIG, MODEL_CONFIG, TEMPLATES, USER_PREFERENCES } from "@/lib/content"
import { server } from "@/test-server"

const SPEECH_CONFIG = {
  provider: "dashscope",
  region: "cn-beijing",
  endpoint: "",
  model: "paraformer-v2",
  keyConfigured: true,
}

afterEach(cleanup)

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsForm agent={AGENT_CONFIG} model={MODEL_CONFIG} prefs={USER_PREFERENCES} templates={TEMPLATES} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function speechKeyInput(): HTMLInputElement {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="password"]')
  // 模型配置的 Key 在前，语音识别的 Key 在后。
  return inputs[inputs.length - 1]
}

describe("SettingsForm 语音识别配置", () => {
  it("显示脱敏状态，保存时把当前表单值（含新 Key）提交", async () => {
    let putBody: Record<string, unknown> | undefined
    server.use(
      http.get("/api/speech/config", () => HttpResponse.json(SPEECH_CONFIG)),
      http.put("/api/speech/config", async ({ request }) => {
        putBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(SPEECH_CONFIG)
      }),
    )
    renderForm()

    // 等语音识别区真正渲染出来再取 Key 输入框（模型区也有同名的「已配置」文案）。
    const saveButton = await screen.findByRole("button", { name: "保存语音识别配置" })
    expect(screen.getAllByText("已配置（不回显）").length).toBeGreaterThanOrEqual(2)
    fireEvent.change(speechKeyInput(), { target: { value: "sk-new-speech" } })
    fireEvent.click(saveButton)

    await waitFor(() => expect(putBody).toBeDefined())
    expect(putBody).toEqual({
      provider: "dashscope",
      region: "cn-beijing",
      endpoint: "",
      model: "paraformer-v2",
      apiKey: "sk-new-speech",
    })
    expect(await screen.findByText("已保存")).toBeInTheDocument()
  })

  it("测试凭据成功时走 i18n 文案，且 Key 为空时不重复下发", async () => {
    let testBody: Record<string, unknown> | undefined
    server.use(
      http.get("/api/speech/config", () => HttpResponse.json(SPEECH_CONFIG)),
      http.post("/api/speech/config:test", async ({ request }) => {
        testBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ at: "2026-10-09T12:00:00+08:00", ok: true, message: "凭据可用（HTTP 200）" })
      }),
    )
    renderForm()

    fireEvent.click(await screen.findByRole("button", { name: "测试凭据" }))

    expect(await screen.findByText("凭据可用")).toBeInTheDocument()
    expect(screen.queryByText("凭据可用（HTTP 200）")).not.toBeInTheDocument()
    await waitFor(() => expect(testBody).toBeDefined())
    expect(testBody).not.toHaveProperty("apiKey")
    expect(Object.keys(testBody ?? {}).sort()).toEqual(["endpoint", "model", "provider", "region"])
  })

  it("测试凭据失败时显示后端安全文案，不显示成功文案", async () => {
    server.use(
      http.get("/api/speech/config", () => HttpResponse.json(SPEECH_CONFIG)),
      http.post("/api/speech/config:test", () =>
        HttpResponse.json({ at: "2026-10-09T12:00:00+08:00", ok: false, message: "语音识别服务拒绝凭证，请检查 API Key 与地域配置" }),
      ),
    )
    renderForm()

    fireEvent.click(await screen.findByRole("button", { name: "测试凭据" }))

    expect(await screen.findByText("语音识别服务拒绝凭证，请检查 API Key 与地域配置")).toBeInTheDocument()
    expect(screen.queryByText("凭据可用")).not.toBeInTheDocument()
  })
})
