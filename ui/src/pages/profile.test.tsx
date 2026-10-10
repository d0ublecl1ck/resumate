// SCR-004 个人资料页（Page）查询错误态：
// GET /profile 失败必须渲染错误块（错误码 + 重试），不能永久停在「加载中」。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { ProfilePage } from "@/pages/profile"
import { PROFILE } from "@/lib/content"
import { server } from "@/test-server"

afterEach(cleanup)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("ProfilePage 的查询错误态", () => {
  it("GET /profile 失败时渲染错误块与重试，不再无限加载中", async () => {
    let calls = 0
    server.use(
      http.get("/api/profile", () => {
        calls += 1
        return HttpResponse.json({ code: "RATE_LIMITED", message: "runner busy" }, { status: 500 })
      }),
    )

    renderPage()

    expect(await screen.findByText("个人资料加载失败")).toBeInTheDocument()
    expect(screen.getByText(/RATE_LIMITED/)).toBeInTheDocument()
    expect(screen.queryByText("加载中")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    await waitFor(() => expect(calls).toBeGreaterThan(1))
  })

  it("重试成功后渲染主档，错误块消失", async () => {
    let failing = true
    server.use(
      http.get("/api/profile", () =>
        failing ? HttpResponse.json({ code: "RATE_LIMITED", message: "runner busy" }, { status: 500 }) : HttpResponse.json(PROFILE),
      ),
    )

    renderPage()
    await screen.findByText("个人资料加载失败")

    failing = false
    fireEvent.click(screen.getByRole("button", { name: "重试" }))

    expect(await screen.findByRole("heading", { name: "示例同学" })).toBeInTheDocument()
    expect(screen.queryByText("个人资料加载失败")).not.toBeInTheDocument()
  })
})
