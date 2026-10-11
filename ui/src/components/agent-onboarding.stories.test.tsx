import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Route the stories' browser worker onto the Vitest MSW server for this check only.
vi.mock("@/mocks/browser", async () => {
  const { server } = await import("@/test-server")
  return { worker: { use: server.use.bind(server), resetHandlers: server.resetHandlers.bind(server) } }
})

import {
  ProfileAssistantAuthFailed,
  ProfileAssistantAvailable,
  ProfileAssistantModelMissing,
  ProfileAssistantRuntimeOffline,
  ResumeChatAuthFailed,
  ResumeChatAvailable,
  ResumeChatModelMissing,
  ResumeChatRuntimeOffline,
  SettingsEntryAuthFailed,
  SettingsEntryAvailable,
  SettingsEntryModelMissing,
  SettingsEntryRuntimeOffline,
  StatesGallery,
} from "@/components/agent-onboarding.stories"

afterEach(cleanup)

describe("agent onboarding stories", () => {
  it("还差一步时引导用户去设置", async () => {
    render(ProfileAssistantModelMissing.render())

    expect(await screen.findByText("还差一步")).toBeInTheDocument()
    expect(screen.getByText("先把助手开起来")).toBeInTheDocument()
    expect(screen.getByText(/去设置里把助手需要的信息填好/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去设置" })).toBeInTheDocument()
  })

  it("模型已配置但暂不可用时如实说明，不提供可用的对话输入", async () => {
    render(ProfileAssistantRuntimeOffline.render())

    expect(await screen.findByText("暂不可用")).toBeInTheDocument()
    expect(screen.getByText("助手暂时不可用")).toBeInTheDocument()
    expect(screen.getByText(/助手现在还不能聊天/)).toBeInTheDocument()
    // 诚实性：不出现可用的对话输入，也不出现假装能跑的主操作。
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "开始聊聊" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "去设置" })).not.toBeInTheDocument()
  })

  it("正常可用态作为占位说明将来长什么样", async () => {
    render(ProfileAssistantAvailable.render())

    expect(await screen.findByText("可以开始")).toBeInTheDocument()
    expect(screen.getByText("说说你的经历")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "开始聊聊" })).toBeInTheDocument()
  })

  it("设置页入口同时覆盖未配置与未接入两态", async () => {
    const first = render(SettingsEntryModelMissing.render())
    expect(await screen.findByText("先把助手开起来")).toBeInTheDocument()
    first.unmount()

    render(SettingsEntryRuntimeOffline.render())
    expect(await screen.findByText("助手暂时不可用")).toBeInTheDocument()
  })

  it("简历编辑器对话区也有未配置引导与跳转入口", async () => {
    render(ResumeChatModelMissing.render())

    expect(await screen.findByText("先把助手开起来")).toBeInTheDocument()
    expect(screen.getByText("对话与 Run")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去设置" })).toBeInTheDocument()
  })

  it("凭据被拒：三处表面都给出「去更新 Key」与上游已掩码尾号，且不泄露完整 key", async () => {
    for (const surface of [ProfileAssistantAuthFailed, ResumeChatAuthFailed, SettingsEntryAuthFailed]) {
      const view = render(surface.render())

      expect(await screen.findByText("凭据失效")).toBeInTheDocument()
      expect(screen.getByText("当前 Key 被模型服务拒绝了")).toBeInTheDocument()
      expect(screen.getByText(/\*\*\*\*be21/)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "去更新 Key" })).toBeInTheDocument()
      // 诚实性：被拒时不提供「开始聊聊」，也不出现任何完整 key。
      expect(screen.queryByRole("button", { name: "开始聊聊" })).not.toBeInTheDocument()
      expect(screen.queryByText(/sk-/)).not.toBeInTheDocument()

      view.unmount()
    }
  })

  it("简历编辑器对话区的未接入与可用态作为对照", async () => {
    const first = render(ResumeChatRuntimeOffline.render())
    expect(await screen.findByText("助手暂时不可用")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "去更新 Key" })).not.toBeInTheDocument()
    first.unmount()

    render(ResumeChatAvailable.render())
    expect(await screen.findByText("说说你的经历")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "开始聊聊" })).toBeInTheDocument()
  })

  it("设置页入口的可用态作为对照", async () => {
    render(SettingsEntryAvailable.render())

    expect(await screen.findByText("说说你的经历")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "开始聊聊" })).toBeInTheDocument()
  })

  it("总览 story 并列展示四态", async () => {
    render(StatesGallery.render())

    expect(await screen.findByText("先把助手开起来")).toBeInTheDocument()
    expect(screen.getByText(/当前 Key 被模型服务拒绝了/)).toBeInTheDocument()
    expect(screen.getByText("助手暂时不可用")).toBeInTheDocument()
    expect(screen.getByText("说说你的经历")).toBeInTheDocument()
    expect(screen.getByText(/\*\*\*\*be21/)).toBeInTheDocument()
  })
})
