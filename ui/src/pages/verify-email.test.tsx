import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { server } from "@/test-server"
import { VerifyEmailPage } from "./verify-email"

afterEach(cleanup)

function renderVerify(search: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/verify-email" + search]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/" element={<p>工作台首页</p>} />
          <Route path="/login" element={<p>登录页</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** StrictMode 下渲染：开发模式会触发 mount → cleanup → mount 的双挂载。 */
function renderVerifyStrict(search: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/verify-email" + search]}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/" element={<p>工作台首页</p>} />
            <Route path="/login" element={<p>登录页</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
}

/** 统计发往验证端点的请求次数，随后交回原始 fetch（仍由 MSW 拦截）。 */
async function countVerifyRequests(run: () => Promise<void>): Promise<number> {
  const realFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.includes("/auth/verification/verify")) calls += 1
    return realFetch(input, init)
  }) as typeof fetch
  try {
    await run()
  } finally {
    globalThis.fetch = realFetch
  }
  return calls
}

describe("VerifyEmailPage", () => {
  it("令牌有效时进入验证成功态并可进入工作台", async () => {
    renderVerify("?token=valid-token")

    expect(await screen.findByText("邮箱验证成功")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "进入工作台" }))
    expect(await screen.findByText("工作台首页")).toBeInTheDocument()
  })

  it("令牌失效时展示失效原因并可按 token 重发", async () => {
    renderVerify("?token=expired-token")

    expect(await screen.findByText("验证链接已失效")).toBeInTheDocument()
    expect(screen.getByText("链接已过期。")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "重新发送验证邮件" }))
    expect(await screen.findByText("验证邮件已重新发送到 test@resumate.dev，请查收。")).toBeInTheDocument()
  })

  it("链接没有 token 时提示格式不完整且不提供重发", async () => {
    renderVerify("")

    expect(await screen.findByText("验证链接已失效")).toBeInTheDocument()
    expect(screen.getByText("链接不完整或格式不正确。")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "重新发送验证邮件" })).not.toBeInTheDocument()
  })

  it("重发时邮箱已激活则提示去登录", async () => {
    server.use(
      http.post("/api/auth/verification/resend", () => HttpResponse.json({ status: "already_verified", email: "test@resumate.dev" }, { status: 202 })),
    )
    renderVerify("?token=expired-token")

    await screen.findByText("验证链接已失效")
    fireEvent.click(screen.getByRole("button", { name: "重新发送验证邮件" }))
    expect(await screen.findByText("该邮箱已完成验证，直接登录即可。")).toBeInTheDocument()
  })

  it("可从失效态返回登录页", async () => {
    renderVerify("?token=expired-token")

    await screen.findByText("验证链接已失效")
    fireEvent.click(screen.getByRole("button", { name: "返回登录" }))
    expect(await screen.findByText("登录页")).toBeInTheDocument()
  })

  // 回归：StrictMode 的 mount → cleanup → mount 曾把唯一一次验证请求的结果丢弃，
  // 页面永久停留在「正在验证邮箱」，而令牌已被服务端消费（62adb）。
  it("StrictMode 下有效令牌仍进入验证成功态且只请求一次", async () => {
    const calls = await countVerifyRequests(async () => {
      renderVerifyStrict("?token=valid-token")
      expect(await screen.findByText("邮箱验证成功")).toBeInTheDocument()
    })
    expect(calls).toBe(1)
  })

  it("StrictMode 下失效令牌仍进入失效态", async () => {
    renderVerifyStrict("?token=expired-token")

    expect(await screen.findByText("验证链接已失效")).toBeInTheDocument()
  })
})
