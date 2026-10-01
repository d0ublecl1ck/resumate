// 个人资料助手抽屉的 Agent 可用性引导：还差一步 / 暂不可用 / 可以开始。
// 状态来源：GET /models/config 的 keyConfigured + GET /agent/runtime 的 available。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { ProfileAssistant } from "@/components/profile-assistant"
import { MODEL_CONFIG } from "@/lib/content"
import { server } from "@/test-server"

afterEach(cleanup)

function renderAssistant() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProfileAssistant open onClose={() => {}} onCommitFact={() => {}} onCommitBasics={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("ProfileAssistant 的 Agent 可用性引导", () => {
  it("还差一步时显示「去设置」且不提供对话输入", async () => {
    server.use(http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })))

    renderAssistant()

    expect(await screen.findByText("先把助手开起来")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去设置" })).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("模型已配置但后端无法启动时如实说明，且不提供对话输入", async () => {
    server.use(http.get("/api/agent/runtime", () => HttpResponse.json({ command: "resumate-agent", available: false })))
    renderAssistant()

    expect(await screen.findByText("助手暂时不可用")).toBeInTheDocument()
    expect(
      screen.getByText("助手现在还不能聊天，请稍后再试。"),
    ).toBeInTheDocument()
    expect(screen.queryByText(/界面不会假装能跑/)).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "开始聊聊" })).not.toBeInTheDocument()
  })

  it("模型已配置且后端可启动时显示对话输入，不再说暂不可用", async () => {
    renderAssistant()

    expect(await screen.findByRole("textbox")).toBeInTheDocument()
    expect(screen.queryByText("助手暂时不可用")).not.toBeInTheDocument()
  })
})
