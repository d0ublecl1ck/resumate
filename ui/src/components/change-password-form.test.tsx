import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"
import { ChangePasswordForm } from "@/components/change-password-form"
import { server } from "@/test-server"

afterEach(cleanup)

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ChangePasswordForm />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function fill(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("当前密码"), { target: { value: current } })
  fireEvent.change(screen.getByLabelText("新密码"), { target: { value: next } })
  fireEvent.change(screen.getByLabelText("确认新密码"), { target: { value: confirm } })
}

describe("设置页修改密码表单", () => {
  it("提交当前密码与新密码到 POST /auth/password，成功后展示 i18n 成功文案", async () => {
    let body: Record<string, unknown> | null = null
    server.use(
      http.post("/api/auth/password", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderForm()
    fill("old-password", "new-password-1", "new-password-1")
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }))

    expect(await screen.findByText("密码已更新，请使用新密码重新登录。")).toBeInTheDocument()
    expect(body).toEqual({ currentPassword: "old-password", newPassword: "new-password-1" })
  })

  it("当前密码错误时展示 i18n 文案，不透出服务端 message", async () => {
    server.use(
      http.post("/api/auth/password", () =>
        HttpResponse.json({ code: "INVALID_CREDENTIALS", message: "raw-backend-current-password-should-not-leak" }, { status: 401 }),
      ),
    )

    renderForm()
    fill("wrong-password", "new-password-1", "new-password-1")
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }))

    expect(await screen.findByText("当前密码不正确。")).toBeInTheDocument()
    expect(screen.queryByText(/raw-backend-current-password-should-not-leak/)).not.toBeInTheDocument()
  })

  it("两次新密码不一致时前端拦截，不发请求", async () => {
    let called = false
    server.use(
      http.post("/api/auth/password", () => {
        called = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderForm()
    fill("old-password", "new-password-1", "new-password-2")
    fireEvent.click(screen.getByRole("button", { name: "更新密码" }))

    expect(await screen.findByText("两次输入的新密码不一致。")).toBeInTheDocument()
    expect(called).toBe(false)
  })
})
