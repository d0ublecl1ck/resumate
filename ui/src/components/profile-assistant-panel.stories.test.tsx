// Storybook 渲染契约：个人资料助手抽屉的每个 story 都能渲染出对应状态。
// 断言用中文默认语言下的稳定文案（标题 / 空态 / 错误 / 失效待办），不依赖相对时间。
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  CurrentSession,
  HistoryCompacted,
  HistoryDetail,
  HistoryEmpty,
  HistoryError,
  HistoryList,
  HistoryLoading,
  NewConversationDisabled,
  NewConversationFiltered,
} from "@/components/profile-assistant-panel.stories"

afterEach(cleanup)

describe("profile assistant panel stories", () => {
  it("NewConversationFiltered 渲染可用的新建对话入口与当前对话 tab", () => {
    render(NewConversationFiltered.render())
    expect(screen.getByRole("button", { name: "新建对话" })).toBeEnabled()
    expect(screen.getByRole("tab", { name: "当前对话" })).toHaveAttribute("aria-selected", "true")
  })

  it("NewConversationDisabled 在运行中禁用入口并切换文案", () => {
    render(NewConversationDisabled.render())
    const button = screen.getByRole("button", { name: "正在新建对话…" })
    expect(button).toBeDisabled()
    expect(screen.queryByRole("button", { name: "新建对话" })).not.toBeInTheDocument()
  })

  it("HistoryList 渲染派生标题与无标题兜底，并高亮历史 tab", () => {
    render(HistoryList.render())
    expect(screen.getByRole("tab", { name: "历史会话" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("把工作经历里的性能优化成果提前")).toBeInTheDocument()
    expect(screen.getByText("补充一段云原生迁移经历")).toBeInTheDocument()
    // 第二条会话没有 title：走「未命名对话」兜底，绝不渲染 undefined。
    expect(screen.getByText(/未命名对话/)).toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
  })

  it("HistoryEmpty 渲染历史空态", () => {
    render(HistoryEmpty.render())
    expect(screen.getByText("还没有历史会话")).toBeInTheDocument()
  })

  it("HistoryLoading 渲染历史加载态", () => {
    render(HistoryLoading.render())
    expect(screen.getByText("正在加载会话…")).toBeInTheDocument()
  })

  it("HistoryError 渲染历史错误态并透出后端详情", () => {
    render(HistoryError.render())
    expect(screen.getByText("会话加载失败")).toBeInTheDocument()
    expect(screen.getByText(/503/)).toBeInTheDocument()
  })

  it("HistoryDetail 渲染会话详情与底部继续输入框", () => {
    render(HistoryDetail.render())
    expect(screen.getByRole("heading", { level: 2, name: /把工作经历里的性能优化成果提前/ })).toBeInTheDocument()
    expect(screen.getByText("把工作经历里的性能优化成果提前。")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("在这个会话继续对话…")).toBeInTheDocument()
    expect(screen.getByText(/继续发送会写入这条会话/)).toBeInTheDocument()
  })

  it("HistoryCompacted 把压缩历史渲染成独立区块，不透出原始标记", () => {
    render(HistoryCompacted.render())
    expect(screen.getByText("已压缩的历史")).toBeInTheDocument()
    expect(screen.getByText(/Earlier turns read the profile/)).toBeInTheDocument()
    expect(screen.queryByText(/\[compacted-history\]/)).not.toBeInTheDocument()
  })

  it("CurrentSession 渲染当前对话与「该待办已随轮次关闭失效」的失效待办", () => {
    render(CurrentSession.render())
    expect(screen.getByText("把工作经历里的性能优化成果提前。")).toBeInTheDocument()
    expect(screen.getByText("已生成一条待确认的改动，确认后才会写入主档。")).toBeInTheDocument()
    expect(screen.getByText("已失效")).toBeInTheDocument()
    expect(screen.getByText(/该待办已随轮次关闭失效/)).toBeInTheDocument()
    // 失效待办不给可点入口，避免点出必得 409 的「批准并应用」。
    expect(screen.queryByRole("button", { name: "批准并应用" })).not.toBeInTheDocument()
  })
})
