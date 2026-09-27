import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { server } from "@/test-server"
import { RequireAuth } from "./require-auth"

afterEach(cleanup)

function renderGuard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/secret"]}>
        <Routes>
          <Route path="/login" element={<p>登录页</p>} />
          <Route
            path="/secret"
            element={
              <RequireAuth>
                <p>受保护内容</p>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("RequireAuth", () => {
  it("已登录时渲染子内容", async () => {
    renderGuard()

    expect(await screen.findByText("受保护内容")).toBeInTheDocument()
  })

  it("未登录时重定向到登录页", async () => {
    server.use(http.get("/api/auth/me", () => HttpResponse.json({ code: "UNAUTHENTICATED", message: "未登录" }, { status: 401 })))

    renderGuard()

    expect(await screen.findByText("登录页")).toBeInTheDocument()
  })
})
