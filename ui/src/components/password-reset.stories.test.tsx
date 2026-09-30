import { cleanup, render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Route the stories' browser worker onto the Vitest MSW server for this check only.
vi.mock("@/mocks/browser", async () => {
  const { server } = await import("@/test-server")
  return { worker: { use: server.use.bind(server), resetHandlers: server.resetHandlers.bind(server) } }
})

import {
  ForgotFormDefault,
  ForgotFormSubmitting,
  ForgotFormValidationError,
  ForgotLongEmail,
  ForgotResendCooldown,
  ForgotResendNetworkError,
  ForgotSent,
  ResetDisabled,
  ResetFormDefault,
  ResetFormMismatch,
  ResetFormShortPassword,
  ResetFormSubmitting,
  ResetInvalidExpired,
  ResetInvalidMalformed,
  ResetInvalidToken,
  ResetMissingToken,
  ResetNetworkError,
  ResetStrictMode,
  ResetSuccess,
} from "@/components/password-reset.stories"

afterEach(cleanup)

interface Story {
  render: () => ReactElement
  play?: (context: { canvasElement: HTMLElement }) => Promise<void> | void
}

async function play(story: Story) {
  const { container } = render(story.render())
  if (story.play) await story.play({ canvasElement: container })
  return container
}

describe("password reset stories", () => {
  it("ForgotFormDefault asks for the registered email", () => {
    render(ForgotFormDefault.render())
    expect(screen.getByText("找回密码")).toBeInTheDocument()
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "发送重置邮件" })).toBeEnabled()
  })

  it("ForgotFormSubmitting keeps the submit button busy and disabled", async () => {
    await play(ForgotFormSubmitting)
    expect(await screen.findByRole("button", { name: /正在发送/ })).toBeDisabled()
  })

  it("ForgotFormValidationError blocks an empty address before any request", async () => {
    await play(ForgotFormValidationError)
    expect(await screen.findByRole("alert")).toHaveTextContent("请输入有效的邮箱地址。")
  })

  it("ForgotSent shows the neutral sent state", async () => {
    await play(ForgotSent)
    expect(await screen.findByText("去邮箱查收重置链接")).toBeInTheDocument()
    expect(screen.getByText(/zhang@example\.com/)).toBeInTheDocument()
  })

  it("ForgotLongEmail wraps a long address inside the card", async () => {
    await play(ForgotLongEmail)
    expect(await screen.findByText(/boundary\.check\+resumate@subdomain\.example-enterprise-mail\.test/)).toBeInTheDocument()
  })

  it("ForgotResendCooldown confirms the resend target and disables the button", async () => {
    await play(ForgotResendCooldown)
    expect(await screen.findByText("重置邮件已重新发送到 zhang@example.com，请查收。")).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: /秒后可重发/ })).toBeDisabled()
  })

  it("ForgotResendNetworkError surfaces the network copy", async () => {
    await play(ForgotResendNetworkError)
    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接后端服务，请确认服务已启动。")
  })

  it("ResetFormDefault asks for the new password twice", () => {
    render(ResetFormDefault.render())
    expect(screen.getByText("设置新密码")).toBeInTheDocument()
    expect(screen.getByLabelText("新密码")).toBeInTheDocument()
    expect(screen.getByLabelText("确认新密码")).toBeInTheDocument()
  })

  it("ResetFormSubmitting keeps the submit button busy and disabled", async () => {
    await play(ResetFormSubmitting)
    expect(await screen.findByRole("button", { name: /正在保存/ })).toBeDisabled()
  })

  it("ResetFormShortPassword rejects a password under the shared length contract", async () => {
    await play(ResetFormShortPassword)
    expect(await screen.findByRole("alert")).toHaveTextContent("密码至少 8 位。")
  })

  it("ResetFormMismatch rejects two different passwords", async () => {
    await play(ResetFormMismatch)
    expect(await screen.findByRole("alert")).toHaveTextContent("两次输入的密码不一致。")
  })

  it("ResetSuccess confirms the new credential", async () => {
    await play(ResetSuccess)
    expect(await screen.findByText("密码已重置")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "去登录" })).toBeInTheDocument()
  })

  it("ResetInvalidToken maps the machine code instead of the server message", async () => {
    await play(ResetInvalidToken)
    expect(await screen.findByText("重置链接已失效")).toBeInTheDocument()
    expect(await screen.findByRole("alert")).toHaveTextContent("重置链接无效，请重新获取。")
  })

  it("ResetInvalidExpired explains the expired link", async () => {
    await play(ResetInvalidExpired)
    expect(await screen.findByText("重置链接已失效")).toBeInTheDocument()
    expect(screen.getByText("链接已过期。")).toBeInTheDocument()
  })

  it("ResetMissingToken shows the malformed dead-link state without a form", async () => {
    await play(ResetMissingToken)
    expect(await screen.findByText("重置链接已失效")).toBeInTheDocument()
    expect(screen.getByText("链接不完整或格式不正确。")).toBeInTheDocument()
    expect(screen.queryByLabelText("新密码")).not.toBeInTheDocument()
  })

  it("ResetInvalidMalformed offers a fresh link request", async () => {
    await play(ResetInvalidMalformed)
    expect(await screen.findByText("重置链接已失效")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "重新申请重置邮件" })).toBeInTheDocument()
  })

  it("ResetNetworkError keeps the form usable and surfaces the network copy", async () => {
    await play(ResetNetworkError)
    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接后端服务，请确认服务已启动。")
    expect(screen.getByLabelText("新密码")).toBeInTheDocument()
  })

  it("ResetDisabled hides every action", async () => {
    await play(ResetDisabled)
    expect(screen.getByRole("button", { name: "保存新密码" })).toBeDisabled()
  })

  it("ResetStrictMode sends the one-time token exactly once and commits the result", async () => {
    const realFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url.includes("/auth/password/reset")) calls += 1
      return realFetch(input, init)
    }) as typeof fetch
    try {
      await play(ResetStrictMode)
      expect(await screen.findByText("密码已重置")).toBeInTheDocument()
    } finally {
      globalThis.fetch = realFetch
    }
    expect(calls).toBe(1)
  })
})
