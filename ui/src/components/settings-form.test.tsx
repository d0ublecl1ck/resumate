import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SettingsForm } from "@/components/settings-form"
import { AGENT_CONFIG, MODEL_CONFIG, TEMPLATES, USER_PREFERENCES } from "@/lib/content"

afterEach(cleanup)

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SettingsForm agent={AGENT_CONFIG} model={MODEL_CONFIG} prefs={USER_PREFERENCES} templates={TEMPLATES} />
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
})
