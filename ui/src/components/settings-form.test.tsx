import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { SettingsForm } from "@/components/settings-form"
import { AGENT_CONFIG, MODEL_CONFIG, TEMPLATES, USER_PREFERENCES } from "@/lib/content"
import type { ModelConfig } from "@/lib/types"
import { server } from "@/test-server"

afterEach(cleanup)

function renderForm(model: ModelConfig = MODEL_CONFIG) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SettingsForm agent={AGENT_CONFIG} model={model} prefs={USER_PREFERENCES} templates={TEMPLATES} />
    </QueryClientProvider>,
  )
}

describe("SettingsForm", () => {
  it("保存偏好后显示已保存", async () => {
    renderForm()

    fireEvent.click(screen.getByRole("switch", { name: /自动保存/ }))
    fireEvent.click(screen.getByRole("button", { name: "保存偏好" }))

    expect(await screen.findByText("已保存")).toBeInTheDocument()
  })

  it("可编辑快捷键并保存", async () => {
    renderForm()

    fireEvent.change(screen.getByRole("textbox", { name: "保存 / flush 快捷键" }), { target: { value: "⌘ K" } })
    fireEvent.click(screen.getByRole("button", { name: "保存偏好" }))

    expect(await screen.findByText("已保存")).toBeInTheDocument()
  })

  it("测试连接展示后端返回结果", async () => {
    renderForm()

    fireEvent.click(screen.getByRole("button", { name: /测试连接/ }))

    expect(await screen.findByText(/HTTP 200/)).toBeInTheDocument()
  })

  it("从模型目录加载 provider 与 model", async () => {
    renderForm()

    expect(await screen.findByText("目录来源：models.dev")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Provider" })).toHaveTextContent("OpenAI")
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent("GPT-4o mini")
  })

  it("模型未配置时在 Agent 分区引导去配置模型", async () => {
    renderForm({ ...MODEL_CONFIG, keyConfigured: false })

    expect(await screen.findByText("先配置一个模型")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去设置模型" })).toBeInTheDocument()
  })

  it("运行体未接入时在 Agent 分区如实说明", async () => {
    renderForm()

    expect(await screen.findByText("AI 能力尚未接入")).toBeInTheDocument()
    expect(
      screen.getByText("模型已经配置好，但还没有任何运行体进程在处理 Agent 请求。在你看到这条状态期间，对话与 Run 都不会执行。"),
    ).toBeInTheDocument()
  })

  it("切换 provider 后从对应目录选择 model 并保存", async () => {
    let saved: { provider?: string; model?: string; endpoint?: string } | undefined
    server.use(
      http.put("/api/models/config", async ({ request }) => {
        saved = (await request.json()) as { provider?: string; model?: string; endpoint?: string }
        return HttpResponse.json({ ...MODEL_CONFIG, provider: saved.provider, model: saved.model })
      }),
    )

    renderForm()

    const providerTrigger = await screen.findByRole("combobox", { name: "Provider" })
    fireEvent.click(providerTrigger)
    const anthropic = await screen.findByRole("option", { name: "Anthropic" })
    fireEvent.pointerDown(anthropic, { pointerType: "mouse" })
    fireEvent.click(anthropic)

    const modelTrigger = screen.getByRole("combobox", { name: "Model" })
    expect(modelTrigger).toHaveTextContent("Claude 3.5 Sonnet")

    fireEvent.click(modelTrigger)
    const opus = await screen.findByRole("option", { name: "Claude 3 Opus" })
    fireEvent.pointerDown(opus, { pointerType: "mouse" })
    fireEvent.click(opus)
    expect(modelTrigger).toHaveTextContent("Claude 3 Opus")

    fireEvent.click(screen.getByRole("button", { name: "保存模型配置" }))

    await waitFor(() => expect(saved).toMatchObject({ provider: "anthropic", model: "claude-3-opus" }))
  })
})
