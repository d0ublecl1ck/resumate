// 会话消息 → Run 时间线的纯投影（issue 9d3cb）。
// 会话层是对话的唯一真相：agent-core 的 SessionJournal 把每轮模型上下文镜像进
// agent_session_messages，run 结束再写一条 {text} 的最终回复。轮次投影只有
// turn.message / result.message，会话存在时必须合并且不能重复渲染同一条用户消息。

import { describe, expect, it } from "vitest"

import { buildRunTimeline, sessionMessageText } from "@/lib/run-conversation"
import type { AgentSessionMessage, RunTimelineEvent } from "@/lib/types"

function message(
  input: Pick<AgentSessionMessage, "seq" | "role" | "content"> & Partial<AgentSessionMessage>,
): AgentSessionMessage {
  return {
    id: `msg_${input.seq}`,
    sessionId: "sess_1",
    createdAt: "2026-10-07T10:00:00Z",
    ...input,
  }
}

const USER_TEXT = "把一句话头衔改成「资深后端工程师」"

const FALLBACK: RunTimelineEvent[] = [
  { id: "turn_1:message", kind: "message", at: "2026-10-07T09:59:00Z", role: "user", text: USER_TEXT },
  { id: "turn_1:result", kind: "finalize", at: "2026-10-07T10:01:00Z", role: "agent", text: "轮次已提交" },
]

describe("sessionMessageText", () => {
  it("reads the wire string, the {content} wire and the {text} reply without translating", () => {
    expect(sessionMessageText("  你好  ")).toBe("你好")
    expect(sessionMessageText({ role: "user", content: "你好" })).toBe("你好")
    expect(sessionMessageText({ text: "最终回复" })).toBe("最终回复")
    expect(sessionMessageText({ role: "assistant", content: "" })).toBeNull()
    expect(sessionMessageText(null)).toBeNull()
  })
})

describe("buildRunTimeline", () => {
  it("projects user, agent and tool-call activity in seq order", () => {
    const timeline = buildRunTimeline(
      [
        message({ seq: 1, role: "system", content: { role: "system", content: "system prompt" } }),
        message({ seq: 2, role: "user", content: { role: "user", content: USER_TEXT } }),
        message({
          seq: 3,
          role: "assistant",
          content: {
            role: "assistant",
            content: "我先读工作副本。",
            toolCalls: [{ id: "call_1", name: "get_working_document", arguments: { resume_id: "res_1" } }],
          },
        }),
        message({ seq: 4, role: "tool", content: { role: "tool", content: "{\"ok\":true}", name: "get_working_document" } }),
        message({ seq: 5, role: "assistant", content: { text: "已生成一条待确认的修改。" } }),
      ],
      FALLBACK,
    )

    const texts = timeline.map((event) => event.text)
    expect(texts).toContain(USER_TEXT)
    expect(texts).toContain("我先读工作副本。")
    expect(texts).toContain("已生成一条待确认的修改。")
    expect(texts).toContain("轮次已提交")
    // system 提示词不进面板；tool 结果不进面板（只保留工具调用活动行）。
    expect(texts).not.toContain("system prompt")
    expect(texts.some((text) => text.includes("\"ok\":true"))).toBe(false)
    expect(timeline.some((event) => event.kind === "tool_progress" && event.toolName === "get_working_document")).toBe(true)
  })

  it("keeps exactly one user bubble when the turn projection repeats the session prompt", () => {
    const timeline = buildRunTimeline(
      [message({ seq: 2, role: "user", content: { role: "user", content: USER_TEXT } })],
      FALLBACK,
    )

    expect(timeline.filter((event) => event.kind === "message" && event.role === "user")).toHaveLength(1)
    expect(timeline.filter((event) => event.id === "turn_1:message")).toHaveLength(0)
    expect(timeline.some((event) => event.text === "轮次已提交")).toBe(true)
  })

  it("falls back to the turn projection when the session has no projectable messages", () => {
    const timeline = buildRunTimeline([], FALLBACK)

    expect(timeline.map((event) => event.text)).toEqual([USER_TEXT, "轮次已提交"])
  })

  it("emits a tool activity line even when the assistant text is empty", () => {
    const timeline = buildRunTimeline(
      [
        message({
          seq: 3,
          role: "assistant",
          content: { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "preview_patch", arguments: { turn_id: "turn_1" } }] },
        }),
      ],
      [],
    )

    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({ kind: "tool_progress", toolName: "preview_patch" })
    expect(timeline[0]?.text).toContain("turn_1")
  })
})
