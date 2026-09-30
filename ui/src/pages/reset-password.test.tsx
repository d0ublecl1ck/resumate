import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { delay, http, HttpResponse } from "msw"
import { server } from "@/test-server"
import { ResetPasswordPage } from "./reset-password"

afterEach(cleanup)

function renderReset(search: string, options: { strict?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const routes = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/reset-password" + search]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/forgot-password" element={<p>忘记密码页</p>} />
          <Route path="/login" element={<p>登录页</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(options.strict ? <StrictMode>{routes}</StrictMode> : routes)
}

function fill(passwords: { password: string; confirm: string }) {
  fireEvent.change(screen.getByLabelText("新密码"), { target: { value: passwords.password } })
  fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: passwords.confirm } })
}

const TOKEN = "?token=valid-reset-token"

describe("ResetPasswordPage", () => {
  it("地址里没有 token 时直接进入失效态且不发请求", async () => {
    const calls: string[] = []
    server.use(
      http.post("/api/auth/password/reset", ({ request }) => {
        calls.push(request.url)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderReset("")

    expect(await screen.findByText("重置链接已失效")).toBeInTheDocument()
    expect(screen.getByText("链接不完整或格式不正确。")).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it("两次密码不一致在提交前拦截", async () => {
    const calls: string[] = []
    server.use(
      http.post("/api/auth/password/reset", ({ request }) => {
        calls.push(request.url)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderReset(TOKEN)

    fill({ password: "new-password-2", confirm: "other-password-3" })
    fireEvent.click(screen.getByRole("button", { name: "保存新密码" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("两次输入的密码不一致。")
    expect(calls).toHaveLength(0)
  })

  it("短密码在提交前拦截", async () => {
    renderReset(TOKEN)

    fill({ password: "short", confirm: "short" })
    fireEvent.click(screen.getByRole("button", { name: "保存新密码" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("密码至少 8 位。")
  })

  it("提交中禁用按钮，成功后进入成功态并可去登录", async () => {
    server.use(
      http.post("/api/auth/password/reset", async () => {
        await delay(30)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderReset(TOKEN)

    fill({ password: "new-password-2", confirm: "new-password-2" })
    fireEvent.click(screen.getByRole("button", { name: "保存新密码" }))

    expect(await screen.findByRole("button", { name: /正在保存/ })).toBeDisabled()
    expect(await screen.findByText("密码已重置")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "去登录" }))
    expect(await screen.findByText("登录页")).toBeInTheDocument()
  })

  it("令牌失效时进入失效态并可重新申请重置邮件", async () => {
    server.use(
      http.post("/api/auth/password/reset", () =>
        HttpResponse.json({ code: "PASSWORD_RESET_TOKEN_INVALID", message: "reset link invalid" }, { status: 400 }),
      ),
    )
    renderReset("?token=expired-reset-token")

    fill({ password: "new-password-2", confirm: "new-password-2" })
    fireEvent.click(screen.getByRole("button", { name: "保存新密码" }))

    expect(await screen.findByText("重置链接已失效")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("重置链接无效，请重新获取。")

    fireEvent.click(screen.getByRole("button", { name: "重新申请重置邮件" }))
    expect(await screen.findByText("忘记密码页")).toBeInTheDocument()
  })

  it("StrictMode 双挂载下一次性令牌只发一次请求且提交结果", async () => {
    const realFetch = globalThis.fetch
    let calls = 0
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      if (url.includes("/auth/password/reset")) calls += 1
      return realFetch(input, init)
    }) as typeof fetch
    try {
      renderReset(TOKEN, { strict: true })

      fill({ password: "new-password-2", confirm: "new-password-2" })
      fireEvent.click(screen.getByRole("button", { name: "保存新密码" }))

      expect(await screen.findByText("密码已重置")).toBeInTheDocument()
    } finally {
      globalThis.fetch = realFetch
    }
    expect(calls).toBe(1)
  })
})
