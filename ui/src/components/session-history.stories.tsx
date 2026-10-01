// Storybook confirmation artifact for 历史会话（SCR-004）：会话列表 + 会话详情。
// 纯展示组件 + 注入数据：不接真实端点、不动路由、不改 lib/api.ts。
// 数据形状镜像后端契约（GET /sessions、GET /sessions/{id}/messages），字段一个不多。
import type { SessionMessage, SessionSummary } from "@/components/session-history"
import { SessionDetail, SessionList } from "@/components/session-history"

const SESSIONS: SessionSummary[] = [
  { id: "ses_000000000001", createdAt: "2026-09-30T09:00:00Z", lastActiveAt: "2026-10-01T02:10:00Z" },
  { id: "ses_000000000002", createdAt: "2026-09-29T08:00:00Z", lastActiveAt: "2026-09-30T18:00:00Z" },
]

// seq 故意留出空档：压缩会把会话 seq 重新锚定，不能当连续计数。
const MESSAGES: SessionMessage[] = [
  { id: "msg_1", seq: 1, role: "system", content: { role: "system", content: "You operate a Resumate resume through the public API." } },
  { id: "msg_2", seq: 2, role: "user", content: { role: "user", content: "把工作经历里的性能优化成果提前。" } }, // i18n-allow: 用户内容不翻译（US-13.4）
  {
    id: "msg_3",
    seq: 3,
    role: "assistant",
    content: { role: "assistant", content: "先读一下工作副本。", toolCalls: [{ id: "c1", name: "get_working_document" }] }, // i18n-allow: 用户内容不翻译（US-13.4）
  },
  {
    id: "msg_4",
    seq: 4,
    role: "tool",
    content: { role: "tool", content: "{\"resumeId\":\"res_1\",\"workingRevision\":2}", toolCallId: "c1", name: "get_working_document" },
  },
]

const COMPACTED: SessionMessage[] = [
  ...MESSAGES.slice(0, 2),
  {
    id: "msg_7",
    seq: 7,
    role: "system",
    content: {
      role: "system",
      content: "[compacted-history]\\nEarlier turns loaded the working document and previewed one patch.",
      compactedHistory: true,
      compactedMessages: 3,
    },
  },
  { id: "msg_12", seq: 12, role: "assistant", content: { role: "assistant", content: "已把性能优化成果提到第一条。" } }, // i18n-allow: 用户内容不翻译（US-13.4）
]

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl rounded-xl border border-input bg-background p-6">{children}</div>
}

export default {
  title: "Pages/SessionHistory",
  parameters: { layout: "fullscreen" },
}

export const ListDefault = {
  render: () => (
    <Frame>
      <SessionList sessions={SESSIONS} activeId={SESSIONS[0].id} onSelect={() => {}} />
    </Frame>
  ),
}

export const ListEmpty = {
  render: () => (
    <Frame>
      <SessionList sessions={[]} onSelect={() => {}} />
    </Frame>
  ),
}

export const ListLoading = {
  render: () => (
    <Frame>
      <SessionList onSelect={() => {}} />
    </Frame>
  ),
}

export const ListError = {
  render: () => (
    <Frame>
      <SessionList error="GET /sessions 失败（503）" onSelect={() => {}} /> {/* i18n-allow: 后端错误详情不翻译 */}
    </Frame>
  ),
}

export const DetailDefault = {
  render: () => (
    <Frame>
      <SessionDetail session={SESSIONS[0]} messages={MESSAGES} onBack={() => {}} />
    </Frame>
  ),
}

export const DetailCompacted = {
  render: () => (
    <Frame>
      <SessionDetail session={SESSIONS[0]} messages={COMPACTED} onBack={() => {}} />
    </Frame>
  ),
}

export const DetailEmpty = {
  render: () => (
    <Frame>
      <SessionDetail session={SESSIONS[1]} messages={[]} onBack={() => {}} />
    </Frame>
  ),
}

export const DetailLoading = {
  render: () => (
    <Frame>
      <SessionDetail session={SESSIONS[0]} onBack={() => {}} />
    </Frame>
  ),
}

export const DetailError = {
  render: () => (
    <Frame>
      <SessionDetail session={SESSIONS[0]} error="GET /sessions/ses_000000000001/messages 失败（500）" onBack={() => {}} /> {/* i18n-allow: 后端错误详情不翻译 */}
    </Frame>
  ),
}
