// 初始查询失败时的错误出口：四个查询任一失败都必须渲染错误状态块（错误码 + 重试），
// 而不是把 undefined 交给 SettingsForm 触发整页白屏。
// 错误文案走 i18n，并断言不出现原始异常关键字。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { SettingsPage } from "@/pages/settings"
import { AGENT_CONFIG } from "@/lib/content"
import { server } from "@/test-server"

afterEach(cleanup)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>,
  )
}

function failWith500() {
  return HttpResponse.json({ code: "INTERNAL_ERROR", message: "settings backend exploded" }, { status: 500 })
}

// 四个初始查询端点：任一失败都不得白屏。
const ENDPOINTS = ["/api/agent/config", "/api/models/config", "/api/settings", "/api/templates"]

describe("SettingsPage 初始查询失败", () => {
  for (const endpoint of ENDPOINTS) {
    it(endpoint + " 返回 500 时渲染错误块而不是白屏", async () => {
      server.use(http.get(endpoint, failWith500))

      renderPage()

      const alert = await screen.findByRole("alert")
      expect(alert).toHaveTextContent("设置加载失败")
      expect(alert).toHaveTextContent(/INTERNAL_ERROR/)
      expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
      // 负向：不得出现未捕获异常的原始报错，也不得渲染空表单。
      expect(screen.queryByText(/Cannot read properties/)).not.toBeInTheDocument()
      expect(screen.queryByText("Agent 运行模式")).not.toBeInTheDocument()
    })
  }

  it("重试后恢复成功则渲染真实表单", async () => {
    let failing = true
    server.use(http.get("/api/agent/config", () => (failing ? failWith500() : HttpResponse.json(AGENT_CONFIG))))

    renderPage()
    await screen.findByRole("alert")

    failing = false
    fireEvent.click(screen.getByRole("button", { name: "重试" }))

    expect(await screen.findByText("Agent 运行模式")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })
})
