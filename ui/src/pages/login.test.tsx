import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { server } from "@/test-server"
import { ForgotPasswordPage } from "./forgot-password"
import { LoginPage } from "./login"

afterEach(cleanup)

beforeEach(() => {
  server.use(http.get("/api/auth/me", () => HttpResponse.json({ code: "UNAUTHENTICATED", message: "未登录" }, { status: 401 })))
})

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/" element={<p>工作台首页</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("LoginPage", () => {
  it("登录成功后进入工作台", async () => {
    renderLogin()

    fireEvent.change(await screen.findByLabelText("邮箱"), { target: { value: "test@resumate.dev" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    expect(await screen.findByText("工作台首页")).toBeInTheDocument()
  })

  it("提供忘记密码入口并可跳转到找回密码页", async () => {
    renderLogin()

    fireEvent.click(await screen.findByRole("button", { name: "忘记密码？" }))

    expect(await screen.findByText("找回密码")).toBeInTheDocument()
  })

  it("凭据错误时展示统一提示", async () => {
    renderLogin()

    fireEvent.change(await screen.findByLabelText("邮箱"), { target: { value: "test@resumate.dev" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong-password" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱或密码不正确。")
  })

  it("注册成功后进入查收邮件状态，不再直接登录", async () => {
    renderLogin()

    fireEvent.click(await screen.findByRole("button", { name: "去注册" }))
    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "张沐" } })
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "new@resumate.dev" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } })
    fireEvent.click(screen.getByRole("button", { name: "注册" }))

    expect(await screen.findByText("去邮箱查收验证链接")).toBeInTheDocument()
    expect(screen.getByText(/new@resumate\.dev/)).toBeInTheDocument()
  })

  it("未验证邮箱被拒时提供内联重发并反馈结果", async () => {
    renderLogin()

    fireEvent.change(await screen.findByLabelText("邮箱"), { target: { value: "unverified@resumate.dev" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱还未验证，请先完成邮箱验证。")
    fireEvent.click(screen.getByRole("button", { name: "重新发送验证邮件" }))
    expect(await screen.findByText("验证邮件已重新发送到 unverified@resumate.dev，请查收。")).toBeInTheDocument()
  })

  it("后端校验失败时展示中文提示而不是英文原文", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ code: "VALIDATION_FAILED", message: "value is not a valid email address" }, { status: 422 }),
      ),
    )
    renderLogin()

    fireEvent.change(await screen.findByLabelText("邮箱"), { target: { value: "test@resumate.dev" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "password123" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("请检查邮箱和密码格式后重试。")
  })
})
