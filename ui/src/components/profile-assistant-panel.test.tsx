// 个人资料助手抽屉展示组件的交互契约：回调只做声明、由调用方决定请求。
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProfileAssistantPanel, type ProfileCurrentRun } from "@/components/profile-assistant-panel"
import type { SessionMessage, SessionSummary } from "@/components/session-history"

afterEach(cleanup)

const SESSIONS: SessionSummary[] = [
  { id: "ses_1", createdAt: "2026-09-30T09:00:00Z", lastActiveAt: "2026-10-01T02:10:00Z", title: "性能优化成果提前", messageCount: 2 },
]

const MESSAGES: SessionMessage[] = [
  { id: "msg_1", seq: 1, role: "user", content: { role: "user", content: "把成果提前。" } },
]

const RUN: ProfileCurrentRun = { bubbles: [{ id: "b1", role: "agent", text: "已生成一条待确认的改动。" }] }

describe("ProfileAssistantPanel 回调", () => {
  it("点击新建对话触发 onCreate", () => {
    const onCreate = vi.fn()
    render(<ProfileAssistantPanel mode="current" currentRun={RUN} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole("button", { name: "新建对话" }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it("切换 tab 触发 onModeChange 并带上目标视图", () => {
    const onModeChange = vi.fn()
    render(<ProfileAssistantPanel mode="current" currentRun={RUN} onModeChange={onModeChange} />)
    fireEvent.click(screen.getByRole("tab", { name: "历史会话" }))
    expect(onModeChange).toHaveBeenCalledWith("history")
  })

  it("历史列表点击会话触发 onSelect 并带上 id", () => {
    const onSelect = vi.fn()
    render(<ProfileAssistantPanel mode="history" sessions={SESSIONS} onSelect={onSelect} />)
    fireEvent.click(screen.getByText("性能优化成果提前"))
    expect(onSelect).toHaveBeenCalledWith("ses_1")
  })

  it("历史详情点击返回触发 onBack", () => {
    const onBack = vi.fn()
    render(
      <ProfileAssistantPanel
        mode="history"
        sessions={SESSIONS}
        activeSessionId="ses_1"
        messages={MESSAGES}
        onBack={onBack}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "返回列表" }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it("历史详情继续输入框提交触发 onContinue 并清空草稿", () => {
    const onContinue = vi.fn()
    render(
      <ProfileAssistantPanel
        mode="history"
        sessions={SESSIONS}
        activeSessionId="ses_1"
        messages={MESSAGES}
        onContinue={onContinue}
      />,
    )
    const input = screen.getByPlaceholderText("在这个会话继续对话…")
    fireEvent.change(input, { target: { value: "  再补充一条  " } })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))
    expect(onContinue).toHaveBeenCalledWith("再补充一条")
    expect(input).toHaveValue("")
  })

  it("空草稿不触发 onContinue", () => {
    const onContinue = vi.fn()
    render(
      <ProfileAssistantPanel
        mode="history"
        sessions={SESSIONS}
        activeSessionId="ses_1"
        messages={MESSAGES}
        onContinue={onContinue}
      />,
    )
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled()
    expect(onContinue).not.toHaveBeenCalled()
  })
})
