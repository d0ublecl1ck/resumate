// SCR-011 页面：按 access:read 渲染无权限态且不发日志请求；只有读权限时禁用写入口；
// 筛选变更把页码重置到第 1 页。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { AccessPage } from "@/pages/settings-access"
import { server } from "@/test-server"

afterEach(cleanup)

function userWith(permissions: string[]) {
  return {
    id: "user_test",
    email: "test@resumate.dev",
    displayName: "测试用户",
    role: "super_admin",
    roles: ["super_admin"],
    permissions,
    isBanned: false,
    createdAt: "2026-01-01T00:00:00+08:00",
  }
}

function logRow(id: string) {
  return {
    id,
    at: "2026-09-20T13:00:05+08:00",
    clientId: "本地 MCP 客户端",
    scope: "resume:read",
    resource: "高级前端工程师简历",
    purpose: "pat_auth",
    result: "allowed",
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AccessPage />
    </QueryClientProvider>,
  )
}

describe("AccessPage 权限态", () => {
  it("无 access:read 时显示无权限态且不请求审计日志", async () => {
    let logCalls = 0
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json(userWith([]))),
      http.get("/api/access/logs", () => {
        logCalls += 1
        return HttpResponse.json([])
      }),
    )

    renderPage()

    expect(await screen.findByText("无权访问开放接入")).toBeInTheDocument()
    expect(screen.getByText(/access:read/)).toBeInTheDocument()
    expect(logCalls).toBe(0)
  })

  it("只有 access:read 时禁用创建入口", async () => {
    server.use(http.get("/api/auth/me", () => HttpResponse.json(userWith(["access:read"]))))

    renderPage()

    const create = await screen.findByRole("button", { name: /创建最小权限 Token/ })
    expect(create).toBeDisabled()
  })
})

describe("AccessPage 日志查询", () => {
  it("翻页请求对应页码，筛选变更重置到第 1 页", async () => {
    const pages: string[] = []
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json(userWith(["access:read", "access:write"]))),
      http.get("/api/access/logs", ({ request }) => {
        const url = new URL(request.url)
        pages.push(url.searchParams.get("page") ?? "1")
        return HttpResponse.json([logRow(`al_${pages.length}`)], { headers: { "X-Total-Count": "45" } })
      }),
    )

    renderPage()
    await screen.findByText("第 1 / 3 页")

    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    await screen.findByText("第 2 / 3 页")

    fireEvent.change(screen.getByLabelText("用途"), { target: { value: "token_create" } })
    await screen.findByText("第 1 / 3 页")

    expect(pages[pages.length - 1]).toBe("1")
  })

  it("日志请求失败时日志区显示错误态，令牌区仍然渲染", async () => {
    server.use(
      http.get("/api/auth/me", () => HttpResponse.json(userWith(["access:read", "access:write"]))),
      http.get("/api/access/logs", () => HttpResponse.json({ code: "RATE_LIMITED", message: "busy" }, { status: 500 })),
    )

    renderPage()

    expect(await screen.findByText("审计日志加载失败")).toBeInTheDocument()
    expect(screen.getByText("个人访问令牌（PAT）")).toBeInTheDocument()
  })
})
