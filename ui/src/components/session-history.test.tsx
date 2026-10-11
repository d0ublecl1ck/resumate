// 会话列表与会话入口的展示契约（issue b3533 / e5290）。
// 一行一个会话（一个会话含若干轮消息）：行主文案是话题标题，按最近活跃时间分组
// （今天 / 昨天 / 7 天内 / 30 天内 / 更早），行内不出现会话 ID。
// 标题与消息数是可选展示入参，后端 GET /sessions 暂无对应字段，因此这里同时守住
// 「派生标题优先」与「缺失兜底」，确保任何字段缺失都不会渲染 undefined。
import dayjs from "dayjs"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  NewConversationEntry,
  SessionList,
  groupSessionsByTime,
  sessionBucket,
  type SessionSummary,
} from "@/components/session-history"

afterEach(cleanup)

const DAY_MS = 24 * 60 * 60 * 1000

/** 相对当前时间的 ISO：让分组落在可预期的桶里，不写死会过期的日期。 */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

function session(overrides: Partial<SessionSummary> & { id: string }): SessionSummary {
  return { createdAt: daysAgo(3), lastActiveAt: daysAgo(0), ...overrides }
}

function twoSessions(): SessionSummary[] {
  return [
    session({ id: "ses_000000000001", lastActiveAt: daysAgo(0), title: "性能优化成果提前", messageCount: 12 }),
    session({ id: "ses_000000000002", lastActiveAt: daysAgo(1), messageCount: 3 }),
  ]
}

const GROUPED: SessionSummary[] = [
  session({ id: "ses_today", lastActiveAt: daysAgo(0), title: "今天的议题" }),
  session({ id: "ses_yesterday", lastActiveAt: daysAgo(1), title: "昨天的议题" }),
  session({ id: "ses_week", lastActiveAt: daysAgo(3), title: "本周的议题" }),
  session({ id: "ses_month", lastActiveAt: daysAgo(20), title: "本月的议题" }),
  session({ id: "ses_old", lastActiveAt: daysAgo(60), title: "更早的议题" }),
]

describe("sessionBucket 分组口径", () => {
  const now = dayjs("2026-10-09T12:00:00+08:00")

  it("按最近活跃时间与今天零点的日历日差归档", () => {
    expect(sessionBucket("2026-10-09T09:00:00+08:00", now)).toBe("today")
    expect(sessionBucket("2026-10-08T23:00:00+08:00", now)).toBe("yesterday")
    expect(sessionBucket("2026-10-04T10:00:00+08:00", now)).toBe("last7Days")
    expect(sessionBucket("2026-09-20T10:00:00+08:00", now)).toBe("last30Days")
    expect(sessionBucket("2026-07-01T10:00:00+08:00", now)).toBe("earlier")
  })

  it("无效时间不能丢行，归入「更早」", () => {
    expect(sessionBucket("not-a-timestamp", now)).toBe("earlier")
  })

  it("分组顺序固定且跳过空组", () => {
    const groups = groupSessionsByTime(
      [session({ id: "a", lastActiveAt: "2026-09-20T10:00:00+08:00" }), session({ id: "b", lastActiveAt: "2026-10-09T09:00:00+08:00" })],
      now,
    )
    expect(groups.map((group) => group.bucket)).toEqual(["today", "last30Days"])
  })
})

describe("SessionList 标题与兜底", () => {
  it("有展示入参 title 时优先用 title，并补 N 条消息", () => {
    render(<SessionList sessions={twoSessions()} />)
    expect(screen.getByText("性能优化成果提前")).toBeInTheDocument()
    expect(screen.getByText(/12 条消息/)).toBeInTheDocument()
  })

  it("缺 title 时退回「未命名对话」，绝不渲染 undefined", () => {
    render(<SessionList sessions={twoSessions()} />)
    expect(screen.getByText("未命名对话")).toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
    expect(screen.queryByText(/null/)).not.toBeInTheDocument()
  })

  it("没有 messageCount 的会话不渲染消息数", () => {
    render(<SessionList sessions={[session({ id: "ses_a", title: "有标题没条数" })]} />)
    expect(screen.getByText("有标题没条数")).toBeInTheDocument()
    expect(screen.queryByText(/条消息/)).not.toBeInTheDocument()
  })

  it("列表行内不出现会话 ID（可访问名同样不含 ID）", () => {
    render(<SessionList sessions={twoSessions()} />)
    expect(screen.queryByText(/000000000001/)).not.toBeInTheDocument()
    expect(screen.queryByText(/000000000002/)).not.toBeInTheDocument()
    expect(screen.queryByText(/ID /)).not.toBeInTheDocument()
    const rows = screen.getAllByRole("button")
    expect(rows.map((row) => row.textContent)).not.toEqual(expect.arrayContaining([expect.stringContaining("ses_")]))
  })

  it("一行一个会话：会话数等于行数", () => {
    render(<SessionList sessions={twoSessions()} />)
    expect(screen.getAllByRole("button")).toHaveLength(2)
  })
})

describe("SessionList 时间分组", () => {
  it("按 今天 / 昨天 / 7 天内 / 30 天内 / 更早 分组", () => {
    render(<SessionList sessions={GROUPED} />)
    for (const label of ["今天", "昨天", "7 天内", "30 天内", "更早"]) {
      expect(screen.getByRole("region", { name: label })).toBeInTheDocument()
    }
    expect(screen.getByText("今天的议题")).toBeInTheDocument()
    expect(screen.getByText("更早的议题")).toBeInTheDocument()
  })

  it("空组不渲染分组标题", () => {
    render(<SessionList sessions={[session({ id: "ses_only_today", lastActiveAt: daysAgo(0), title: "只有今天" })]} />)
    expect(screen.getByRole("region", { name: "今天" })).toBeInTheDocument()
    for (const label of ["昨天", "7 天内", "30 天内", "更早"]) {
      expect(screen.queryByRole("region", { name: label })).not.toBeInTheDocument()
    }
  })

  it("仅一个会话时只渲染一个分组一行", () => {
    render(<SessionList sessions={[session({ id: "ses_single", lastActiveAt: daysAgo(1), title: "唯一的会话" })]} />)
    expect(screen.getAllByRole("button")).toHaveLength(1)
    expect(screen.getByRole("region", { name: "昨天" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "今天" })).not.toBeInTheDocument()
  })

  it("选中态沿用 aria-current 与 border-cobalt", () => {
    render(<SessionList sessions={twoSessions()} activeId="ses_000000000002" />)
    const row = screen.getByText("未命名对话").closest("button")
    expect(row).toHaveAttribute("aria-current", "true")
    expect(row).toHaveClass("border-cobalt")
  })
})

describe("SessionList 新会话提示与三态", () => {
  it("选中「刚创建还没发消息」的会话时给新对话空态提示", () => {
    render(<SessionList sessions={[session({ id: "ses_new", messageCount: 0 })]} activeId="ses_new" />)
    expect(screen.getByText("这是新对话")).toBeInTheDocument()
    expect(screen.getByText(/还没有发送消息/)).toBeInTheDocument()
  })

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
