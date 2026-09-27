import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { server } from "@/test-server"
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

  it("凭据错误时展示统一提示", async () => {
    renderLogin()

    fireEvent.change(await screen.findByLabelText("邮箱"), { target: { value: "test@resumate.dev" } })
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "wrong-password" } })
    fireEvent.click(screen.getByRole("button", { name: "登录" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("邮箱或密码不正确。")
  })
})
