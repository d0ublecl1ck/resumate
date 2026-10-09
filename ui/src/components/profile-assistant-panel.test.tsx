// 个人资料助手抽屉展示组件的交互契约：回调只做声明、由调用方决定请求。
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ProfileAssistantPanel, type ProfileCurrentRun } from "@/components/profile-assistant-panel"
import type { SessionMessage, SessionSummary } from "@/components/session-history"
import type { PendingAction, RunError } from "@/lib/types"

afterEach(cleanup)

const SESSIONS: SessionSummary[] = [
  { id: "ses_1", createdAt: "2026-09-30T09:00:00Z", lastActiveAt: "2026-10-01T02:10:00Z", title: "性能优化成果提前", messageCount: 2 },
]

const MESSAGES: SessionMessage[] = [
  { id: "msg_1", seq: 1, role: "user", content: { role: "user", content: "把成果提前。" } },
]

const RUN: ProfileCurrentRun = { bubbles: [{ id: "b1", role: "agent", text: "已生成一条待确认的改动。" }] }

const PENDING_ACTION: PendingAction = {
  id: "act_1",
  kind: "profile_change",
  title: "补充一条事实",
  targetResource: "profile.facts",
  impactSummary: "新增 1 条事实",
  requiresTextConfirm: false,
  state: "pending",
}

const RUN_ERROR: RunError = {
  code: "MODEL_AUTH_FAILED",
  category: "auth",
  message: "上游 401 拒绝：key ****be21",
  provider: "openai",
  model: "gpt-4o-mini",
  keyHint: "****be21",
}


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
describe("ProfileAssistantPanel 当前对话的运行失败与待办决策", () => {
  // RunErrorBlock 内部用 useNavigate（「去设置更新 Key」），所以带 runError 的渲染要有 Router。
  function renderPanel(node: ReactNode) {
    return render(<MemoryRouter>{node}</MemoryRouter>)
  }

  it("待办的批准 / 拒绝回调透传给 PendingActionCard", () => {
    const onApprove = vi.fn()
    const onReject = vi.fn()
    renderPanel(
      <ProfileAssistantPanel
        mode="current"
        currentRun={{ bubbles: [], pendingActions: [PENDING_ACTION], onApprove, onReject }}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "批准并应用" }))
    expect(onApprove).toHaveBeenCalledWith("act_1")
    fireEvent.click(screen.getByRole("button", { name: "拒绝" }))
    expect(onReject).toHaveBeenCalledWith("act_1")
  })

  it("待办提交中时按钮禁用，避免重复请求", () => {
    renderPanel(
      <ProfileAssistantPanel
        mode="current"
        currentRun={{ bubbles: [], pendingActions: [PENDING_ACTION], busyActionId: "act_1" }}
      />,
    )
    expect(screen.getByRole("button", { name: "批准并应用" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "拒绝" })).toBeDisabled()
  })

  it("当前对话带 runError 时渲染错误块并透出重试", () => {
    const onRetry = vi.fn()
    renderPanel(<ProfileAssistantPanel mode="current" currentRun={{ bubbles: [], runError: RUN_ERROR, onRetry }} />)
    const block = screen.getByTestId("run-error")
    expect(block).toHaveTextContent("模型鉴权失败")
    expect(block).toHaveTextContent("openai / gpt-4o-mini")
    expect(block).toHaveTextContent("****be21")
    fireEvent.click(screen.getByRole("button", { name: "重试" }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    // 负向：错误块只展示已脱敏字段，绝不回显认证头或堆栈。
    expect(screen.queryByText(/Authorization/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Traceback/)).not.toBeInTheDocument()
  })

  it("没有 runError 时不渲染错误块", () => {
    renderPanel(<ProfileAssistantPanel mode="current" currentRun={RUN} />)
    expect(screen.queryByTestId("run-error")).not.toBeInTheDocument()
  })
})
