import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  DetailCompacted,
  DetailDefault,
  DetailEmpty,
  DetailError,
  DetailLoading,
  ListDefault,
  ListEmpty,
  ListError,
  ListLoading,
} from "@/components/session-history.stories"

afterEach(cleanup)

describe("session history stories", () => {
  it("ListDefault renders one row per session with a time-derived label", () => {
    render(ListDefault.render())
    const rows = screen.getAllByRole("button")
    expect(rows).toHaveLength(2)
    // Local time (UTC+8) puts both sessions on the same calendar day.
    expect(screen.getAllByText(/2026-10-01/).length).toBeGreaterThan(0)
    expect(screen.getByText(/000000000001/)).toBeInTheDocument()
  })

  it("ListEmpty explains that no session exists yet", () => {
    render(ListEmpty.render())
    expect(screen.getByText("还没有历史会话")).toBeInTheDocument()
    expect(screen.getByText(/运行体跑过一次之后/)).toBeInTheDocument()
  })

  it("ListLoading shows the loading state", () => {
    render(ListLoading.render())
    expect(screen.getByText("正在加载会话…")).toBeInTheDocument()
  })

  it("ListError surfaces the failure and keeps a next step", () => {
    render(ListError.render())
    expect(screen.getByText("会话加载失败")).toBeInTheDocument()
    expect(screen.getByText(/503/)).toBeInTheDocument()
  })

  it("DetailDefault renders the message flow with role labels", () => {
    render(DetailDefault.render())
    expect(screen.getByText(/把工作经历里的性能优化成果提前。/)).toBeInTheDocument()
    expect(screen.getAllByText("用户").length).toBeGreaterThan(0)
    expect(screen.getAllByText("工具").length).toBeGreaterThan(0)
    expect(screen.getByText(/工具调用：get_working_document/)).toBeInTheDocument()
  })

  it("DetailCompacted renders the summary as its own block, not a plain message", () => {
    render(DetailCompacted.render())
    expect(screen.getByText("已压缩的历史")).toBeInTheDocument()
    expect(screen.getByText(/由旧轮次摘要而来/)).toBeInTheDocument()
    expect(screen.getByText(/Earlier turns loaded the working document/)).toBeInTheDocument()
    // The raw marker must never reach the reader.
    expect(screen.queryByText(/\[compacted-history\]/)).not.toBeInTheDocument()
  })

  it("DetailEmpty explains an empty session", () => {
    render(DetailEmpty.render())
    expect(screen.getByText("这个会话还没有消息")).toBeInTheDocument()
  })

  it("DetailLoading shows the message loading state", () => {
    render(DetailLoading.render())
    expect(screen.getByText("正在加载消息…")).toBeInTheDocument()
  })

  it("DetailError surfaces the message failure", () => {
    render(DetailError.render())
    expect(screen.getByText("消息加载失败")).toBeInTheDocument()
    expect(screen.getByText(/500/)).toBeInTheDocument()
  })

  it("both views disclose that a session has no backend title", () => {
    render(DetailDefault.render())
    expect(screen.getByText(/后端暂未保存会话标题/)).toBeInTheDocument()
  })
})
