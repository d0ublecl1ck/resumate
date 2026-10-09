// 会话列表与会话入口的展示契约（issue b3533）。
// 纯展示组件、注入数据：标题与消息数是可选入参，后端 GET /sessions 暂无对应字段，
// 因此这里同时守住「派生标题优先」和「缺失兜底」，确保任何字段缺失都不会渲染 undefined。
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NewConversationEntry, SessionList, type SessionSummary } from "@/components/session-history"

afterEach(cleanup)

const FIRST: SessionSummary = {
  id: "ses_000000000001",
  createdAt: "2026-09-30T09:00:00Z",
  lastActiveAt: "2026-10-01T02:10:00Z",
}

function twoSessions(): SessionSummary[] {
  return [
    { ...FIRST, title: "性能优化成果提前", messageCount: 12 },
    { ...FIRST, id: "ses_000000000002", lastActiveAt: "2026-09-30T18:00:00Z" },
  ]
}

describe("SessionList 标题与兜底", () => {
  it("有展示入参 title 时优先用 title，并补 N 条消息", () => {
    render(<SessionList sessions={twoSessions()} />)
    expect(screen.getByText("性能优化成果提前")).toBeInTheDocument()
    expect(screen.getByText(/12 条消息/)).toBeInTheDocument()
  })

  it("缺 title 时退回「未命名对话」+ 时间，绝不渲染 undefined", () => {
    render(<SessionList sessions={twoSessions()} />)
    expect(screen.getByText(/未命名对话/)).toBeInTheDocument()
    expect(screen.getByText(/2026-10-01|2026-09-30/)).toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
    expect(screen.queryByText(/null/)).not.toBeInTheDocument()
  })

  it("没有 messageCount 的会话不渲染消息数，但保留 id 尾巴", () => {
    render(<SessionList sessions={twoSessions()} />)
    const withoutCount = screen.getByText(/000000000002/).closest("button")
    expect(withoutCount).not.toHaveTextContent(/条消息/)
    expect(screen.getByText(/000000000001/).closest("button")).toHaveTextContent("12 条消息")
  })

  it("选中态沿用 aria-current 与 border-cobalt", () => {
    render(<SessionList sessions={twoSessions()} activeId="ses_000000000002" />)
    const row = screen.getByText(/未命名对话/).closest("button")
    expect(row).toHaveAttribute("aria-current", "true")
    expect(row).toHaveClass("border-cobalt")
  })

  it("选中「刚创建还没发消息」的会话时给新对话空态提示", () => {
    render(<SessionList sessions={[{ ...FIRST, messageCount: 0 }]} activeId={FIRST.id} />)
    expect(screen.getByText("这是新对话")).toBeInTheDocument()
    expect(screen.getByText(/还没有发送消息/)).toBeInTheDocument()
  })
})

describe("SessionList 空 / 加载 / 错误", () => {
  it("空数组是真正的空态", () => {
    render(<SessionList sessions={[]} />)
    expect(screen.getByText("还没有历史会话")).toBeInTheDocument()
  })

  it("sessions 为 undefined 表示加载中", () => {
    render(<SessionList />)
    expect(screen.getByText("正在加载会话…")).toBeInTheDocument()
  })

  it("error 存在时显示错误态并透出后端详情", () => {
    render(<SessionList error="GET /sessions 失败（503）" />)
    expect(screen.getByText("会话加载失败")).toBeInTheDocument()
    expect(screen.getByText(/503/)).toBeInTheDocument()
  })
})

describe("NewConversationEntry", () => {
  it("默认是可用主按钮，点击触发 onCreate", () => {
    const onCreate = vi.fn()
    render(<NewConversationEntry onCreate={onCreate} />)
    const button = screen.getByRole("button", { name: "新建对话" })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it("提交中禁用按钮、切文案，点击不再触发 onCreate", () => {
    const onCreate = vi.fn()
    render(<NewConversationEntry disabled onCreate={onCreate} />)
    const button = screen.getByRole("button", { name: "正在新建对话…" })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onCreate).not.toHaveBeenCalled()
  })
})
