// SCR-011 访问面板：PAT/日志空态、日志筛选与分页、只读权限禁用写入口，
// 以及用途列本地化与 PAT 弹窗的模态焦点契约。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AccessPanel } from "@/components/access-panel"
import type { AccessLogFilters } from "@/components/access-panel"
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

const NO_FILTERS: AccessLogFilters = { purpose: "", result: "", query: "", from: "", to: "" }

function renderPanel(
  options: {
    pats?: typeof PATS
    logs?: AccessLogEntry[]
    logsState?: "loading" | "error" | "ready"
    canWrite?: boolean
    filters?: AccessLogFilters
    onFiltersChange?: (patch: Partial<AccessLogFilters>) => void
    page?: number
    total?: number | null
    onPageChange?: (page: number) => void
  } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const logs = options.logs ?? []
  return render(
    <QueryClientProvider client={client}>
      <AccessPanel
        pats={options.pats ?? PATS}
        logs={logs}
        logsState={options.logsState ?? "ready"}
        capability={CAPABILITY}
        canWrite={options.canWrite ?? true}
        filters={options.filters ?? NO_FILTERS}
        onFiltersChange={options.onFiltersChange ?? (() => {})}
        page={options.page ?? 1}
        pageSize={20}
        total={options.total === undefined ? logs.length : options.total}
        onPageChange={options.onPageChange ?? (() => {})}
        onChanged={() => {}}
      />
    </QueryClientProvider>,
  )
}

describe("AccessPanel 用途列", () => {
  it("run_token_scope 显示中文词条而不是英文枚举", () => {
    renderPanel({ logs: [logEntry("run_token_scope")] })

    expect(within(screen.getByRole("table")).getByText("运行令牌权限校验")).toBeInTheDocument()
    expect(screen.queryByText("run_token_scope")).not.toBeInTheDocument()
  })

  it("未知 purpose 回退显示原值而不是裸键名", () => {
    renderPanel({ logs: [logEntry("custom_purpose")] })

    expect(within(screen.getByRole("table")).getByText("custom_purpose")).toBeInTheDocument()
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

describe("PAT 空态", () => {
  it("没有任何令牌时给出空态文案", () => {
    renderPanel({ pats: [] })

    expect(screen.getByText("还没有个人访问令牌")).toBeInTheDocument()
    expect(screen.getByText("创建一个最小权限 Token，供本地 MCP 客户端或脚本调用。")).toBeInTheDocument()
  })
})

describe("只读权限", () => {
  it("无 access:write 时禁用创建与撤销并说明原因", () => {
    renderPanel({ canWrite: false })

    expect(screen.getByRole("button", { name: /创建最小权限 Token/ })).toBeDisabled()
    expect(screen.getByText("当前账号只有读取权限，创建与撤销入口已停用。")).toBeInTheDocument()

    const revokeButtons = screen.getAllByRole("button", { name: "撤销" })
    expect(revokeButtons.length).toBeGreaterThan(0)
    for (const button of revokeButtons) expect(button).toBeDisabled()
  })

  it("有 access:write 时创建入口可用", () => {
    renderPanel({ canWrite: true })

    expect(screen.getByRole("button", { name: /创建最小权限 Token/ })).toBeEnabled()
    expect(screen.queryByText("当前账号只有读取权限，创建与撤销入口已停用。")).not.toBeInTheDocument()
  })
})

describe("日志空态与加载/错误态", () => {
  it("没有任何日志时给出空态文案", () => {
    renderPanel({ logs: [], total: 0 })

    expect(screen.getByText("还没有访问记录")).toBeInTheDocument()
  })

  it("筛选后没有命中时提示调整筛选条件", () => {
    renderPanel({ logs: [], total: 0, filters: { purpose: "token_create", result: "", query: "", from: "", to: "" } })

    expect(screen.getByText("没有符合筛选条件的记录")).toBeInTheDocument()
    expect(screen.queryByText("还没有访问记录")).not.toBeInTheDocument()
  })

  it("加载中显示加载态而不是白屏", () => {
    renderPanel({ logs: [], total: null, logsState: "loading" })

    expect(screen.getByText("审计日志加载中…")).toBeInTheDocument()
  })

  it("加载失败显示错误态", () => {
    renderPanel({ logs: [], total: null, logsState: "error" })

    expect(screen.getByText("审计日志加载失败")).toBeInTheDocument()
  })
})

describe("日志筛选控件", () => {
  it("选择用途时回调筛选变更", () => {
    const onFiltersChange = vi.fn()
    renderPanel({ onFiltersChange })

    fireEvent.change(screen.getByLabelText("用途"), { target: { value: "token_create" } })

    expect(onFiltersChange).toHaveBeenCalledWith({ purpose: "token_create" })
  })

  it("选择结果时回调筛选变更", () => {
    const onFiltersChange = vi.fn()
    renderPanel({ onFiltersChange })

    fireEvent.change(screen.getByLabelText("结果"), { target: { value: "denied" } })

    expect(onFiltersChange).toHaveBeenCalledWith({ result: "denied" })
  })

  it("输入关键字时回调筛选变更", () => {
    const onFiltersChange = vi.fn()
    renderPanel({ onFiltersChange })

    fireEvent.change(screen.getByLabelText("搜索客户端 / Scope / 资源"), { target: { value: "acme" } })

    expect(onFiltersChange).toHaveBeenCalledWith({ query: "acme" })
  })

  it("填写时间范围时回调筛选变更", () => {
    const onFiltersChange = vi.fn()
    renderPanel({ onFiltersChange })

    fireEvent.change(screen.getByLabelText("开始时间"), { target: { value: "2026-10-01T09:00" } })
    expect(onFiltersChange).toHaveBeenCalledWith({ from: "2026-10-01T09:00" })

    fireEvent.change(screen.getByLabelText("结束时间"), { target: { value: "2026-10-09T18:00" } })
    expect(onFiltersChange).toHaveBeenCalledWith({ to: "2026-10-09T18:00" })
  })

  it("已填时间范围时用筛选空态而不是默认空态", () => {
    renderPanel({ logs: [], total: 0, filters: { purpose: "", result: "", query: "", from: "2026-10-01T00:00", to: "" } })

    expect(screen.getByText("没有符合筛选条件的记录")).toBeInTheDocument()
  })
})

describe("日志分页控件", () => {
  it("按总数与页大小渲染页码，翻页触发回调", () => {
    const onPageChange = vi.fn()
    renderPanel({ logs: [logEntry("pat_auth")], total: 45, page: 2, onPageChange })

    expect(screen.getByText("第 2 / 3 页")).toBeInTheDocument()
    expect(screen.getByText("共 45 条")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "下一页" }))
    expect(onPageChange).toHaveBeenCalledWith(3)
  })

  it("第一页禁用上一页", () => {
    renderPanel({ logs: [logEntry("pat_auth")], total: 45, page: 1 })

    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "下一页" })).toBeEnabled()
  })

  it("最后一页禁用下一页", () => {
    renderPanel({ logs: [logEntry("pat_auth")], total: 45, page: 3 })

    expect(screen.getByRole("button", { name: "下一页" })).toBeDisabled()
  })

  it("空结果不渲染分页控件", () => {
    renderPanel({ logs: [], total: 0 })

    expect(screen.queryByRole("button", { name: "下一页" })).not.toBeInTheDocument()
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