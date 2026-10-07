import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SettingsForm } from "@/components/settings-form"
import { changeLocale } from "@/i18n"
import { AGENT_CONFIG, MODEL_CONFIG, TEMPLATES, USER_PREFERENCES } from "@/lib/content"
import type { ModelConfig } from "@/lib/types"
import { server } from "@/test-server"

// jsdom 没有 scrollIntoView；用显式 spy 把「只滚动」这个被修掉的旧行为变成可断言的事实。
const scrollIntoView = vi.fn()

beforeEach(() => {
  scrollIntoView.mockClear()
  Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView
})

afterEach(() => {
  changeLocale("zh-CN")
  cleanup()
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderForm(model: ModelConfig = MODEL_CONFIG) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route
            path="/settings"
            element={<SettingsForm agent={AGENT_CONFIG} model={model} prefs={USER_PREFERENCES} templates={TEMPLATES} />}
          />
          <Route path="/profile" element={<div>profile route</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
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

    fireEvent.change(screen.getByRole("textbox", { name: "保存并提交 快捷键" }), { target: { value: "⌘ K" } })
    fireEvent.click(screen.getByRole("button", { name: "保存偏好" }))

    expect(await screen.findByText("已保存")).toBeInTheDocument()
  })

  it("测试连接成功态走 i18n 文案，不直出后端中文 message", async () => {
    renderForm()

    fireEvent.click(screen.getByRole("button", { name: /测试连接/ }))

    expect(await screen.findByText("连接成功")).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 200/)).not.toBeInTheDocument()
  })

  it("en 界面下测试连接成功态显示英文", async () => {
    changeLocale("en")
    renderForm()

    fireEvent.click(screen.getByRole("button", { name: /Test connection/ }))

    expect(await screen.findByText("Connected")).toBeInTheDocument()
    expect(screen.queryByText("连接成功")).not.toBeInTheDocument()
  })

  it("业务失败态仍显示后端返回的业务原文", async () => {
    server.use(
      http.post("/api/models/config:test", () =>
        HttpResponse.json({ at: "2026-10-07T10:00:00+08:00", ok: false, message: "连接失败 (HTTP 401)" }),
      ),
    )
    renderForm({ ...MODEL_CONFIG, lastTest: undefined })

    fireEvent.click(screen.getByRole("button", { name: /测试连接/ }))

    expect(await screen.findByText("连接失败 (HTTP 401)")).toBeInTheDocument()
    expect(screen.queryByText("连接成功")).not.toBeInTheDocument()
  })

  it("默认模板下拉具备可访问名", async () => {
    renderForm()

    expect(await screen.findByRole("combobox", { name: "默认模板" })).toBeInTheDocument()
  })

  it("从模型目录加载 provider 与 model，且不再显示目录来源", async () => {
    renderForm()

    expect(await screen.findByRole("combobox", { name: "Provider" })).toHaveTextContent("OpenAI")
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveTextContent("GPT-4o mini")
    expect(screen.queryByText(/目录来源|Catalog source/)).not.toBeInTheDocument()
  })

  it("还差一步时在 Agent 分区引导去配置模型", async () => {
    renderForm({ ...MODEL_CONFIG, keyConfigured: false })

    expect(await screen.findByText("先把助手开起来")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去设置" })).toBeInTheDocument()
  })

  it("暂不可用时在 Agent 分区如实说明", async () => {
    server.use(http.get("/api/agent/runtime", () => HttpResponse.json({ command: "resumate-agent", available: false })))
    renderForm()

    expect(await screen.findByText("助手暂时不可用")).toBeInTheDocument()
    expect(
      screen.getByText("助手现在还不能聊天，请稍后再试。"),
    ).toBeInTheDocument()
  })

  it("后端可在需要时启动时显示可以开始而非暂不可用", async () => {
    renderForm()

    expect(await screen.findByText("说说你的经历")).toBeInTheDocument()
    expect(screen.queryByText("助手暂时不可用")).not.toBeInTheDocument()
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

  it("测试连接把当前表单的 provider / endpoint / model 与本次输入的 API Key 一起发送", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.post("/api/models/config:test", async ({ request }) => {
        const text = await request.text()
        body = text ? (JSON.parse(text) as Record<string, unknown>) : undefined
        return HttpResponse.json({ at: "2026-10-07T10:00:00+08:00", ok: true, message: "连接成功（HTTP 200）" })
      }),
    )

    const { container } = renderForm()

    fireEvent.change(screen.getByPlaceholderText("https://api.example.com/v1"), { target: { value: "https://api.deepseek.com/v1" } })
    fireEvent.change(container.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "sk-current-form" } })
    fireEvent.click(screen.getByRole("button", { name: /测试连接/ }))

    await waitFor(() => expect(body).toBeDefined())
    expect(body).toEqual({
      provider: "openai",
      endpoint: "https://api.deepseek.com/v1",
      model: "gpt-4o-mini",
      apiKey: "sk-current-form",
    })
  })

  it("API Key 输入框为空时不发送 apiKey，沿用已存 key", async () => {
    let body: Record<string, unknown> | undefined
    server.use(
      http.post("/api/models/config:test", async ({ request }) => {
        const text = await request.text()
        body = text ? (JSON.parse(text) as Record<string, unknown>) : undefined
        return HttpResponse.json({ at: "2026-10-07T10:00:00+08:00", ok: true, message: "连接成功（HTTP 200）" })
      }),
    )

    renderForm()
    fireEvent.click(screen.getByRole("button", { name: /测试连接/ }))

    await waitFor(() => expect(body).toBeDefined())
    expect(body).not.toHaveProperty("apiKey")
    expect(body).not.toHaveProperty("api_key")
    expect(Object.keys(body ?? {}).sort()).toEqual(["endpoint", "model", "provider"])
  })

  it("显示持久化的上次测试结果时补「上次测试：<时间>」", async () => {
    renderForm({ ...MODEL_CONFIG, lastTest: { at: "2026-09-19T20:00:00+08:00", ok: true, message: "连接成功，延迟 420ms" } })

    expect(await screen.findByText(/连接成功/)).toBeInTheDocument()
    expect(screen.queryByText("连接成功，延迟 420ms")).not.toBeInTheDocument()
    expect(screen.getByText(/上次测试：2026-09-19 20:00/)).toBeInTheDocument()
  })

  it("本次点击得到的测试结果不带「上次测试」时间", async () => {
    server.use(
      http.post("/api/models/config:test", () =>
        HttpResponse.json({ at: "2026-10-07T10:00:00+08:00", ok: true, message: "连接成功（HTTP 200）" }),
      ),
    )
    renderForm({ ...MODEL_CONFIG, lastTest: { at: "2026-09-19T20:00:00+08:00", ok: true, message: "连接成功，延迟 420ms" } })

    fireEvent.click(screen.getByRole("button", { name: /测试连接/ }))

    expect(await screen.findByText("连接成功")).toBeInTheDocument()
    expect(screen.queryByText(/上次测试：/)).not.toBeInTheDocument()
  })

  it("「开始聊聊」进入可对话入口而不是只滚动到模型区", async () => {
    renderForm()

    fireEvent.click(await screen.findByRole("button", { name: "开始聊聊" }))

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/profile?assistant=1"))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("「去设置」仍滚动到模型配置区且不导航", async () => {
    renderForm({ ...MODEL_CONFIG, keyConfigured: false })

    fireEvent.click(await screen.findByRole("button", { name: "去设置" }))

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" })
    expect(screen.getByTestId("location")).toHaveTextContent("/settings")
  })

  it("自动保存间隔越界时显示错误、置 aria-invalid 并拦截提交", async () => {
    let patchBody: unknown
    server.use(
      http.patch("/api/settings", async ({ request }) => {
        patchBody = await request.json()
        return HttpResponse.json(USER_PREFERENCES)
      }),
    )
    renderForm()

    const input = screen.getByRole("spinbutton", { name: "自动保存间隔（秒）" })
    fireEvent.change(input, { target: { value: "1" } })

    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByText("自动保存间隔需为 3–120 秒的整数。")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "保存偏好" }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(patchBody).toBeUndefined()
    expect(screen.queryByText("已保存")).not.toBeInTheDocument()
  })

  it("改回合法值后按原值保存，不做静默夹取", async () => {
    let patchBody: { autosaveIntervalSeconds?: number } | undefined
    server.use(
      http.patch("/api/settings", async ({ request }) => {
        patchBody = (await request.json()) as { autosaveIntervalSeconds?: number }
        return HttpResponse.json(USER_PREFERENCES)
      }),
    )
    renderForm()

    const input = screen.getByRole("spinbutton", { name: "自动保存间隔（秒）" })
    fireEvent.change(input, { target: { value: "1" } })
    fireEvent.change(input, { target: { value: "30" } })
    expect(input).not.toHaveAttribute("aria-invalid")

    fireEvent.click(screen.getByRole("button", { name: "保存偏好" }))

    await waitFor(() => expect(patchBody).toBeDefined())
    expect(patchBody).toMatchObject({ autosaveIntervalSeconds: 30 })
  })
})
