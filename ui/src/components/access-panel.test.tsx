// 访问面板：用途列本地化（含未知值兜底）与 PAT 弹窗的模态焦点契约。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AccessPanel } from "@/components/access-panel"
import { CAPABILITY, PATS } from "@/lib/content"
import type { AccessLogEntry } from "@/lib/types"

afterEach(cleanup)

function logEntry(purpose: string): AccessLogEntry {
  return {
    id: "al_test",
    at: "2026-09-20T13:00:05+08:00",
    clientId: "运行令牌",
    scope: "resume:read",
    resource: "/api/resumes",
    purpose,
    result: "allowed",
  }
}

function renderPanel(logs: AccessLogEntry[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AccessPanel pats={PATS} logs={logs} capability={CAPABILITY} onChanged={() => {}} />
    </QueryClientProvider>,
  )
}

describe("AccessPanel 用途列", () => {
  it("run_token_scope 显示中文词条而不是英文枚举", () => {
    renderPanel([logEntry("run_token_scope")])

    expect(screen.getByText("运行令牌权限校验")).toBeInTheDocument()
    expect(screen.queryByText("run_token_scope")).not.toBeInTheDocument()
  })

  it("未知 purpose 回退显示原值而不是裸键名", () => {
    renderPanel([logEntry("custom_purpose")])

    expect(screen.getByText("custom_purpose")).toBeInTheDocument()
    expect(screen.queryByText(/settings\.accessLog\.purposeValue/)).not.toBeInTheDocument()
  })
})

describe("AccessPanel 能力卡片", () => {
  it("URL 卡片带 min-w-0，窄屏单列时不会撑破容器", () => {
    renderPanel()

    const grid = screen.getByText("能力发现").closest("dl")
    expect(grid).toHaveClass("min-w-0")
    const cards = Array.from(grid?.children ?? [])
    expect(cards).toHaveLength(3)
    for (const card of cards) expect(card).toHaveClass("min-w-0")
  })
})

describe("PAT 弹窗焦点管理", () => {
  it("打开后焦点进入弹窗、Esc 关闭并把焦点归还触发按钮，背景 inert 取下", async () => {
    const { container } = renderPanel()
    const trigger = screen.getByRole("button", { name: /创建最小权限 Token/ })
    trigger.focus()

    fireEvent.click(trigger)
    const dialog = await screen.findByRole("dialog")
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    // 背景被标记为 inert，键盘与辅助技术都无法穿到弹窗外。
    expect(container).toHaveAttribute("inert")

    fireEvent.keyDown(document, { key: "Escape" })

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(container).not.toHaveAttribute("inert")
  })

  it("Tab 循环时焦点不会逃出弹窗", async () => {
    renderPanel()
    fireEvent.click(screen.getByRole("button", { name: /创建最小权限 Token/ }))
    const dialog = await screen.findByRole("dialog")
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))

    for (let index = 0; index < 12; index += 1) {
      fireEvent.keyDown(document.activeElement ?? document, { key: "Tab" })
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })
})
