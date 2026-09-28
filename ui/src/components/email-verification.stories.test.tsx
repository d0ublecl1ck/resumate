import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Route the stories' browser worker onto the Vitest MSW server for this check only.
vi.mock("@/mocks/browser", async () => {
  const { server } = await import("@/test-server")
  return { worker: { use: server.use.bind(server), resetHandlers: server.resetHandlers.bind(server) } }
})

import {
  LoginUnverified,
  RegisterNetworkError,
  RegisterRateLimited,
  RegisterResendPending,
  RegisterResendTooSoon,
  RegisterSent,
  VerifyChecking,
  VerifyInvalidToken,
  VerifyLinkExpired,
  VerifySuccess,
} from "@/components/email-verification.stories"

afterEach(cleanup)

describe("email verification stories", () => {
  it("RegisterSent shows the mailbox to check", async () => {
    render(RegisterSent.render())
    expect(await screen.findByText("去邮箱查收验证链接")).toBeInTheDocument()
    expect(screen.getByText(/zhang@example\.com/)).toBeInTheDocument()
  })

  it("RegisterResendPending keeps the resend button busy and disabled", async () => {
    const { container } = render(RegisterResendPending.render())

    await RegisterResendPending.play({ canvasElement: container })

    const button = await screen.findByRole("button", { name: /正在发送/ })
    expect(button).toBeDisabled()
  })

  it("RegisterResendTooSoon surfaces the cooldown error", async () => {
    const { container } = render(RegisterResendTooSoon.render())

    await RegisterResendTooSoon.play({ canvasElement: container })

    expect(await screen.findByRole("alert")).toHaveTextContent("重发过于频繁，请稍后再试。")
  })

  it("RegisterRateLimited surfaces the rate limit error", async () => {
    const { container } = render(RegisterRateLimited.render())

    await RegisterRateLimited.play({ canvasElement: container })

    expect(await screen.findByRole("alert")).toHaveTextContent("操作过于频繁，请稍后再试。")
  })

  it("RegisterNetworkError surfaces the network error", async () => {
    const { container } = render(RegisterNetworkError.render())

    await RegisterNetworkError.play({ canvasElement: container })

    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接后端服务，请确认服务已启动。")
  })

  it("VerifyChecking keeps the pending state", async () => {
    render(VerifyChecking.render())
    expect(await screen.findByText("正在验证邮箱")).toBeInTheDocument()
  })

  it("VerifySuccess confirms the activated account", async () => {
    render(VerifySuccess.render())
    expect(await screen.findByText("邮箱验证成功")).toBeInTheDocument()
  })

  it("VerifyInvalidToken falls back to the invalid state", async () => {
    render(VerifyInvalidToken.render())
    expect(await screen.findByText("验证链接已失效")).toBeInTheDocument()
  })

  it("VerifyLinkExpired explains the expired reason", async () => {
    render(VerifyLinkExpired.render())
    expect(await screen.findByText("验证链接已失效")).toBeInTheDocument()
    expect(screen.getByText("链接已过期。")).toBeInTheDocument()
  })

  it("LoginUnverified warns that the email is not verified", async () => {
    render(LoginUnverified.render())
    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱还未验证，请先完成邮箱验证。")
  })
})
