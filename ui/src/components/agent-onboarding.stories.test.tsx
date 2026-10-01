import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Route the stories' browser worker onto the Vitest MSW server for this check only.
vi.mock("@/mocks/browser", async () => {
  const { server } = await import("@/test-server")
  return { worker: { use: server.use.bind(server), resetHandlers: server.resetHandlers.bind(server) } }
})

import {
  ProfileAssistantAvailable,
  ProfileAssistantModelMissing,
  ProfileAssistantRuntimeOffline,
  SettingsEntryModelMissing,
  SettingsEntryRuntimeOffline,
  StatesGallery,
} from "@/components/agent-onboarding.stories"

afterEach(cleanup)

describe("agent onboarding stories", () => {
  it("模型未配置时引导用户去设置", async () => {
    render(ProfileAssistantModelMissing.render())

    expect(await screen.findByText("模型未配置")).toBeInTheDocument()
    expect(screen.getByText("先配置一个模型")).toBeInTheDocument()
    expect(screen.getByText(/OpenAI 兼容的 Endpoint 与 API Key/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去设置模型" })).toBeInTheDocument()
  })

  it("模型已配置但运行体未接入时如实说明，不提供可用的对话输入", async () => {
    render(ProfileAssistantRuntimeOffline.render())

    expect(await screen.findByText("运行体未接入")).toBeInTheDocument()
    expect(screen.getByText("AI 能力尚未接入")).toBeInTheDocument()
    expect(screen.getByText(/还没有任何运行体进程在处理 Agent 请求/)).toBeInTheDocument()
    // 诚实性：不出现可用的对话输入，也不出现假装能跑的主操作。
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "开始对话" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "去设置模型" })).not.toBeInTheDocument()
  })

  it("正常可用态作为占位说明将来长什么样", async () => {
    render(ProfileAssistantAvailable.render())

    expect(await screen.findByText("已接入")).toBeInTheDocument()
    expect(screen.getByText("随时可以开始")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "开始对话" })).toBeInTheDocument()
  })

  it("设置页入口同时覆盖未配置与未接入两态", async () => {
    const first = render(SettingsEntryModelMissing.render())
    expect(await screen.findByText("先配置一个模型")).toBeInTheDocument()
    first.unmount()

    render(SettingsEntryRuntimeOffline.render())
    expect(await screen.findByText("AI 能力尚未接入")).toBeInTheDocument()
  })

  it("总览 story 并列展示三态", async () => {
    render(StatesGallery.render())

    expect(await screen.findByText("先配置一个模型")).toBeInTheDocument()
    expect(screen.getByText("AI 能力尚未接入")).toBeInTheDocument()
    expect(screen.getByText("随时可以开始")).toBeInTheDocument()
  })
})
