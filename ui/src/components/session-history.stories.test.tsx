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
  ListGroupedByTime,
  ListLoading,
  ListSingleSession,
  ListUntitledFallback,
} from "@/components/session-history.stories"

afterEach(cleanup)

describe("session history stories", () => {
  it("ListDefault renders one row per session and never shows the session id", () => {
    render(ListDefault.render())
    const rows = screen.getAllByRole("button")
    expect(rows).toHaveLength(2)
    expect(screen.getAllByText("未命名对话")).toHaveLength(2)
    expect(screen.queryByText(/000000000001/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ID /)).not.toBeInTheDocument()
  })

  it("ListUntitledFallback keeps a readable fallback title", () => {
    render(ListUntitledFallback.render())
    expect(screen.getAllByText("未命名对话")).toHaveLength(2)
  })

  it("ListGroupedByTime renders the five time groups in order", () => {
    render(ListGroupedByTime.render())
    for (const label of ["今天", "昨天", "7 天内", "30 天内", "更早"]) {
      expect(screen.getByRole("region", { name: label })).toBeInTheDocument()
    }
  })

  it("ListSingleSession renders one group with a single row", () => {
    render(ListSingleSession.render())
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(screen.getByRole("region", { name: "昨天" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "今天" })).not.toBeInTheDocument()
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

  it("the detail view discloses where the title comes from", () => {
    render(DetailDefault.render())
    expect(screen.getByText(/首条用户消息派生/)).toBeInTheDocument()
  })
})
