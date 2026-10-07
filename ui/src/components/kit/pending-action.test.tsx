// PendingActionCard 的关闭轮次兜底：卡片是唯一一份「轮次已关闭 -> 待办按失效只读渲染」，
// run-panel 与主档助手都只传 turnClosed，不再各自复制映射。
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PendingActionCard, pendingActionForClosedTurn } from "@/components/kit/pending-action"
import type { PendingAction } from "@/lib/types"
import i18n from "@/i18n"

afterEach(cleanup)

const PENDING: PendingAction = {
  id: "pa_hist",
  kind: "content_patch",
  title: "强化性能成果",
  targetResource: "职业经历",
  impactSummary: "1 处变更",
  requiresTextConfirm: false,
  state: "pending",
}

describe("pendingActionForClosedTurn", () => {
  it("轮次已关闭时把历史 pending 映射为 stale 并补失效原因，且不改写原对象", () => {
    const projected = pendingActionForClosedTurn(PENDING, true, "轮次已关闭")

    expect(projected.state).toBe("stale")
    expect(projected.staleReason).toBe("轮次已关闭")
    expect(PENDING.state).toBe("pending")
    expect(PENDING.staleReason).toBeUndefined()
  })

  it("轮次未关闭时原样返回，未关闭轮次的待办仍走可点路径", () => {
    expect(pendingActionForClosedTurn(PENDING, false, "轮次已关闭")).toBe(PENDING)
  })

  it("后端已给出 staleReason 时不覆盖它", () => {
    const stale: PendingAction = { ...PENDING, state: "stale", staleReason: "已被新的预览取代" }

    expect(pendingActionForClosedTurn(stale, true, "轮次已关闭").staleReason).toBe("已被新的预览取代")
  })
})

describe("PendingActionCard 的 turnClosed 只读渲染", () => {
  it("轮次已关闭时不再渲染可点的批准/拒绝，并显示失效标签与原因", () => {
    render(<PendingActionCard action={PENDING} turnClosed />)

    expect(screen.queryByRole("button", { name: i18n.t("common.actions.approve") })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: i18n.t("common.actions.reject") })).not.toBeInTheDocument()
    expect(screen.getByText(i18n.t("common.pendingAction.stale"))).toBeInTheDocument()
    expect(screen.getByText(i18n.t("common.pendingAction.closedTurnStaleReason"), { exact: false })).toBeInTheDocument()
  })

  it("轮次未关闭时仍渲染可点的批准/拒绝", () => {
    render(<PendingActionCard action={PENDING} onApprove={() => {}} onReject={() => {}} />)

    expect(screen.getByRole("button", { name: i18n.t("common.actions.approve") })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: i18n.t("common.actions.reject") })).toBeInTheDocument()
  })
})
