import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"
import { UsersPage } from "@/pages/users"
import { server } from "@/test-server"
import type { AdminUser, AuthUser } from "@/lib/types"

afterEach(cleanup)

const ME: AuthUser = {
  id: "user_admin",
  email: "admin@resumate.dev",
  displayName: "管理员",
  role: "super_admin",
  roles: ["super_admin"],
  permissions: ["user:read", "user:ban", "user:unban", "role:assign", "role:read"],
  isBanned: false,
  createdAt: "2026-01-01T00:00:00+08:00",
}

const USERS: AdminUser[] = [
  { id: "user_a", email: "alice@example.com", displayName: "Alice", role: "user", roles: ["user"], permissions: [], isBanned: false, createdAt: "2026-01-02T00:00:00+08:00" },
  { id: "user_b", email: "bob@example.com", displayName: "Bob", role: "user", roles: ["user"], permissions: [], isBanned: true, createdAt: "2026-02-03T00:00:00+08:00" },
]

function renderPage() {
  server.use(http.get("/api/auth/me", () => HttpResponse.json(ME)))
  server.use(http.get("/api/auth/users", () => HttpResponse.json(USERS)))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("用户管理页", () => {
  it("列出账号、角色与封禁状态", async () => {
    renderPage()

    expect(await screen.findByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("Bob")).toBeInTheDocument()
    expect(screen.getByText("正常")).toBeInTheDocument()
    expect(screen.getByText("已封禁")).toBeInTheDocument()
  })

  it("改角色发 POST /auth/users/{id}/role", async () => {
    let body: Record<string, unknown> | null = null
    let path = ""
    server.use(
      http.post("/api/auth/users/:id/role", async ({ request, params }) => {
        path = params.id as string
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...USERS[0], role: "super_admin", roles: ["super_admin"] })
      }),
    )

    renderPage()
    await screen.findByText("Alice")
    fireEvent.change(screen.getAllByLabelText("角色")[0], { target: { value: "super_admin" } })
    fireEvent.click(screen.getAllByRole("button", { name: "保存角色" })[0])

    expect(await screen.findByText("角色已更新。")).toBeInTheDocument()
    expect(path).toBe("user_a")
    expect(body).toEqual({ role: "super_admin" })
  })

  it("封禁带原因发 POST /auth/users/{id}/ban", async () => {
    let body: Record<string, unknown> | null = null
    server.use(
      http.post("/api/auth/users/:id/ban", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ ...USERS[0], isBanned: true })
      }),
    )

    renderPage()
    await screen.findByText("Alice")
    fireEvent.click(screen.getAllByRole("button", { name: "封禁" })[0])

    await screen.findByRole("dialog")
    fireEvent.change(screen.getByLabelText("封禁原因"), { target: { value: "违反使用条款" } })
    fireEvent.click(screen.getByRole("button", { name: "确认封禁" }))

    await waitFor(() => expect(body).toEqual({ reason: "违反使用条款" }))
  })

  it("解封已封禁账号发 POST /auth/users/{id}/unban", async () => {
    let path = ""
    server.use(
      http.post("/api/auth/users/:id/unban", ({ params }) => {
        path = params.id as string
        return HttpResponse.json({ ...USERS[1], isBanned: false })
      }),
    )

    renderPage()
    await screen.findByText("Bob")
    fireEvent.click(screen.getByRole("button", { name: "解封" }))

    expect(await screen.findByText("正常")).toBeInTheDocument()
    expect(path).toBe("user_b")
  })

  it("缺少 user:read 时展示 forbidden 状态块而不是表格", async () => {
    server.use(http.get("/api/auth/me", () => HttpResponse.json({ ...ME, permissions: [] })))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <UsersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText("无权访问用户管理")).toBeInTheDocument()
    expect(screen.queryByText("Alice")).not.toBeInTheDocument()
  })
})
