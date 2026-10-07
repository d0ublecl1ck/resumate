// 会话消息 → Run 时间线的纯投影（issue 9d3cb）。
//
// 会话层是对话的唯一真相：agent-core 的 SessionJournal 把每轮模型上下文镜像进
// agent_session_messages（system/user/assistant/tool），run 结束时 `reply()` 再写一条
// `role=assistant, content={text}` 的最终回复（契约 §19.1 / §21.5）。轮次投影只有
// `turn.message` / `result.message`，会话存在时必须合并且不能重复渲染同一条用户消息。

import type { AgentSessionMessage, RunTimelineEvent } from "@/lib/types"

/** 工具活动行里展示的参数 / 结果摘要上限，避免把整段 JSON 灌进面板。 */
const MAX_TOOL_SUMMARY = 120

/** 会话消息 content 是不透明 JSON：可能是 Message wire，也可能是 {text} 的最终回复。 */
export function sessionMessageText(content: unknown): string | null {
  if (typeof content === "string") return content.trim() || null
  if (content !== null && typeof content === "object") {
    const record = content as { text?: unknown; content?: unknown }
    if (typeof record.text === "string") return record.text.trim() || null
    if (typeof record.content === "string") return record.content.trim() || null
  }
  return null
}

/** 从 assistant wire 里取工具调用；只保留有非空 name 的条目。 */
function wireToolCalls(content: unknown): { name: string; arguments: unknown }[] {
  if (content === null || typeof content !== "object") return []
  const raw = (content as { toolCalls?: unknown }).toolCalls
  if (!Array.isArray(raw)) return []
  const calls: { name: string; arguments: unknown }[] = []
  for (const entry of raw) {
    if (entry === null || typeof entry !== "object") continue
    const name = (entry as { name?: unknown }).name
    if (typeof name !== "string" || !name) continue
    calls.push({ name, arguments: (entry as { arguments?: unknown }).arguments })
  }
  return calls
}

function summarize(value: unknown): string {
  if (value === null || value === undefined) return ""
  let text: string
  if (typeof value === "string") {
    text = value
  } else {
    try {
      text = JSON.stringify(value) ?? ""
    } catch {
      return ""
    }
  }
  return text.length > MAX_TOOL_SUMMARY ? text.slice(0, MAX_TOOL_SUMMARY) + "…" : text
}

/**
 * 把会话消息投影成时间线事件：user / assistant 文本各成一条消息，
 * assistant 的 toolCalls 各成一条工具活动；system 与 tool 结果不渲染（契约 §21.5 的
 * 面向用户回复是 `{text}`，模型上下文与工具原始结果只有调试价值）。
 */
export function buildConversationTimeline(messages: AgentSessionMessage[]): RunTimelineEvent[] {
  const events: RunTimelineEvent[] = []
  for (const message of messages) {
    if (message.role === "user") {
      const text = sessionMessageText(message.content)
      if (text) events.push({ id: message.id, kind: "message", at: message.createdAt, role: "user", text })
      continue
    }
    if (message.role !== "assistant") continue
    const text = sessionMessageText(message.content)
    if (text) events.push({ id: message.id, kind: "message", at: message.createdAt, role: "agent", text })
    wireToolCalls(message.content).forEach((call, index) => {
      events.push({
        id: `${message.id}:call:${index}`,
        kind: "tool_progress",
        at: message.createdAt,
        toolName: call.name,
        text: summarize(call.arguments),
      })
    })
  }
  return events
}

/**
 * 合并会话时间线与轮次投影时间线。
 *
 * 去重规则：会话里已经有用户消息时，`turn.message` 的同文本事件丢弃（标准 run 的
 * `turn.message` 常为空，非空时它是同一句 prompt 的副本）；finalize 事件始终保留。
 * 会话为空时原样返回轮次投影，保证「会话不可读 / 旧轮次无会话」仍有当前行为。
 */
export function buildRunTimeline(messages: AgentSessionMessage[], fallback: RunTimelineEvent[]): RunTimelineEvent[] {
  const conversation = buildConversationTimeline(messages)
  if (!conversation.length) return [...fallback]
  const ids = new Set(conversation.map((event) => event.id))
  const userTexts = new Set(
    conversation.filter((event) => event.kind === "message" && event.role === "user").map((event) => event.text),
  )
  const merged = [...conversation]
  for (const event of fallback) {
    if (ids.has(event.id)) continue
    if (event.kind === "message" && event.role === "user" && userTexts.has(event.text)) continue
    merged.push(event)
  }
  return merged
}
