// 简历编辑器对话区 AI 引导四态 story 的渲染校验：真实 ResumeChatPanel + MSW 契约。
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// 与其它 story 测试一致：把 story 里的浏览器 worker 路由到 Vitest MSW server。
vi.mock("@/mocks/browser", async () => {
  const { server } = await import("@/test-server")
  return { worker: { use: server.use.bind(server), resetHandlers: server.resetHandlers.bind(server) } }
})

import {
  AvailabilityAuthFailed,
  AvailabilityAvailable,
  AvailabilityModelMissing,
  AvailabilityRuntimeOffline,
} from "@/components/resume-chat-panel.stories"

afterEach(cleanup)

describe("resume chat panel availability stories", () => {
  it("model_missing：引导取代输入区并拦截发送", async () => {
    render(AvailabilityModelMissing.render())

    expect(await screen.findByText("先把助手开起来")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去设置" })).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "发送" })).not.toBeInTheDocument()
  })

  it("auth_failed：只显示掩码尾号与去更新 Key，不泄露完整 key / Authorization / Traceback", async () => {
    const { container } = render(AvailabilityAuthFailed.render())

    expect(await screen.findByText("凭据失效")).toBeInTheDocument()
    expect(screen.getByText(/\*\*\*\*be21/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去更新 Key" })).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    const text = container.textContent ?? ""
    expect(text).not.toContain("Authorization")
    expect(text).not.toContain("Traceback")
    expect(text).not.toMatch(/sk-[A-Za-z0-9]/)
  })

  it("runtime_offline：说明运行体不可用并拦截发送", async () => {
    render(AvailabilityRuntimeOffline.render())

    expect(await screen.findByText("助手暂时不可用")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("available：正常放行，输入区可见且不显示引导", async () => {
    render(AvailabilityAvailable.render())

    expect(await screen.findByRole("textbox", { name: "对话输入" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument()
    expect(screen.queryByText("先把助手开起来")).not.toBeInTheDocument()
    expect(screen.queryByText("助手暂时不可用")).not.toBeInTheDocument()
  })
})
