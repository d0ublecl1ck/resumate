// 个人资料助手抽屉的 Agent 可用性引导：模型未配置 / 运行体未接入。
// 状态来源：GET /models/config 的 keyConfigured；就绪信号尚不存在。

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
  it("模型未配置时显示「去设置模型」且不提供对话输入", async () => {
    server.use(http.get("/api/models/config", () => HttpResponse.json({ ...MODEL_CONFIG, keyConfigured: false })))

    renderAssistant()

    expect(await screen.findByText("先配置一个模型")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去设置模型" })).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("模型已配置但运行体未接入时如实说明，且不提供对话输入", async () => {
    renderAssistant()

    expect(await screen.findByText("AI 能力尚未接入")).toBeInTheDocument()
    expect(
      screen.getByText("模型已经配置好，但还没有任何运行体进程在处理 Agent 请求。在你看到这条状态期间，对话与 Run 都不会执行。"),
    ).toBeInTheDocument()
    expect(screen.queryByText(/界面不会假装能跑/)).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "开始对话" })).not.toBeInTheDocument()
  })
})
