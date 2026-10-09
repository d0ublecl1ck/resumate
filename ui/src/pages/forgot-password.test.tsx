import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { delay, http, HttpResponse } from "msw"
import { server } from "@/test-server"
import { ForgotPasswordPage } from "./forgot-password"

afterEach(cleanup)

function renderForgot() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/login" element={<p>登录页</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const SENT = { status: "reset_sent", email: "reset@example.com" }

describe("ForgotPasswordPage", () => {
  it("空邮箱提交被客户端拦截且不发请求", async () => {
    const calls: string[] = []
    server.use(
      http.post("/api/auth/password/forgot", ({ request }) => {
        calls.push(request.url)
        return HttpResponse.json(SENT, { status: 202 })
      }),
    )
    renderForgot()

    fireEvent.click(screen.getByRole("button", { name: "发送重置邮件" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("请输入有效的邮箱地址。")
    expect(calls).toHaveLength(0)
  })

  it("提交中禁用按钮，成功后进入已发送态并显示目标邮箱", async () => {
    server.use(
      http.post("/api/auth/password/forgot", async () => {
        await delay(30)
        return HttpResponse.json(SENT, { status: 202 })
      }),
    )
    renderForgot()

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "reset@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "发送重置邮件" }))

    expect(await screen.findByRole("button", { name: /正在发送/ })).toBeDisabled()
    expect(await screen.findByText("去邮箱查收重置链接")).toBeInTheDocument()
    expect(screen.getByText(/重置链接已发送到 reset@example\.com/)).toBeInTheDocument()
  })

  it("换一个邮箱回到表单且清空已发送状态", async () => {
    renderForgot()

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "reset@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "发送重置邮件" }))
    await screen.findByText("去邮箱查收重置链接")

    fireEvent.click(screen.getByRole("button", { name: "换一个邮箱" }))

    expect(await screen.findByRole("button", { name: "发送重置邮件" })).toBeEnabled()
    expect(screen.getByText("找回密码")).toBeInTheDocument()
    expect(screen.queryByText("去邮箱查收重置链接")).not.toBeInTheDocument()
  })

  it("网络错误时行内提示且表单可重试", async () => {
    server.use(http.post("/api/auth/password/forgot", () => HttpResponse.error()))
    renderForgot()

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "reset@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "发送重置邮件" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("无法连接后端服务，请确认服务已启动。")
    expect(screen.getByRole("button", { name: "发送重置邮件" })).toBeEnabled()
  })

  it("发信失败显示通用文案，不显示已发送也不泄漏服务端 message", async () => {
    server.use(
      http.post("/api/auth/password/forgot", () =>
        HttpResponse.json(
          { code: "MAIL_DELIVERY_FAILED", message: "SMTP 未配置：请设置 SMTP_HOST 与 SMTP_FROM_EMAIL" },
          { status: 502 },
        ),
      ),
    )
    renderForgot()

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "reset@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "发送重置邮件" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("邮件发送失败，请稍后重试或联系管理员。")
    // 负向断言：后端原始报错关键字不得出现在界面上。
    expect(screen.queryByText(/SMTP/)).not.toBeInTheDocument()
    expect(screen.queryByText(/SMTP_HOST/)).not.toBeInTheDocument()
    expect(screen.queryByText("去邮箱查收重置链接")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "发送重置邮件" })).toBeEnabled()
  })

  it("返回登录跳回登录页", async () => {
    renderForgot()

    fireEvent.click(screen.getByRole("button", { name: "返回登录" }))

    expect(await screen.findByText("登录页")).toBeInTheDocument()
  })
})
