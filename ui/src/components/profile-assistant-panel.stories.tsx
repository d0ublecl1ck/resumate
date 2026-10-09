// Storybook 确认工件：个人资料助手抽屉（/profile）。
// 新建对话入口 +「当前对话 / 历史会话」切换 + 历史「列表 → 详情 → 底部继续输入框」。
// 纯展示组件 + 注入数据：不接真实端点、不动路由、不改 lib/api.ts；
// 数据形状镜像后端契约（GET /sessions、GET /sessions/{id}/messages），
// title / messageCount 是后端暂未提供的展示层可选入参，story 显式注入以确认派生与兜底。
import type { ReactNode } from "react"
import type { SessionMessage, SessionSummary } from "@/components/session-history"
import {
  ProfileAssistantPanel,
  type ProfileAssistantBubble,
  type ProfileCurrentRun,
} from "@/components/profile-assistant-panel"
import type { PendingAction } from "@/lib/types"

// 展示层注入的派生标题与消息数（后端 GET /sessions 暂未返回）。
const SESSIONS: SessionSummary[] = [
  {
    id: "ses_000000000001",
    createdAt: "2026-09-30T09:00:00Z",
    lastActiveAt: "2026-10-01T02:10:00Z",
    title: "把工作经历里的性能优化成果提前", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
    messageCount: 12,
  },
  {
    id: "ses_000000000002",
    createdAt: "2026-09-29T08:00:00Z",
    lastActiveAt: "2026-09-30T18:00:00Z",
    messageCount: 3,
  },
  {
    id: "ses_000000000003",
    createdAt: "2026-09-20T09:00:00Z",
    lastActiveAt: "2026-09-21T02:10:00Z",
    title: "补充一段云原生迁移经历", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
    messageCount: 7,
  },
]

// seq 故意留出空档：压缩会把会话 seq 重新锚定，不能当连续计数。
const MESSAGES: SessionMessage[] = [
  { id: "msg_1", seq: 1, role: "system", content: { role: "system", content: "You operate a Resumate profile through the public API." } },
  { id: "msg_2", seq: 2, role: "user", content: { role: "user", content: "把工作经历里的性能优化成果提前。" } }, // i18n-allow: 用户内容不翻译（US-13.4）
  {
    id: "msg_3",
    seq: 3,
    role: "assistant",
    content: { role: "assistant", content: "先读一下主档，再生成一条待确认改动。", toolCalls: [{ id: "c1", name: "get_profile" }] }, // i18n-allow: Agent 消息不翻译（US-13.4）
  },
  {
    id: "msg_4",
    seq: 4,
    role: "tool",
    content: { role: "tool", content: "{\"profileId\":\"pro_1\",\"facts\":2}", toolCallId: "c1", name: "get_profile" },
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
      content: "[compacted-history]\\nEarlier turns read the profile and previewed one change.",
      compactedHistory: true,
      compactedMessages: 3,
    },
  },
  { id: "msg_12", seq: 12, role: "assistant", content: { role: "assistant", content: "已把性能优化成果提到第一条。" } }, // i18n-allow: Agent 消息不翻译（US-13.4）
]

const BUBBLES: ProfileAssistantBubble[] = [
  { id: "b1", role: "user", text: "把工作经历里的性能优化成果提前。" }, // i18n-allow: 用户内容不翻译（US-13.4）
  { id: "b2", role: "agent", text: "先读一下主档，再生成一条待确认改动。" }, // i18n-allow: Agent 消息不翻译（US-13.4）
  { id: "b3", role: "agent", text: "已生成一条待确认的改动，确认后才会写入主档。" }, // i18n-allow: Agent 消息不翻译（US-13.4）
]

const CURRENT_RUN: ProfileCurrentRun = { bubbles: BUBBLES }

// state 仍是 pending、但所在轮次已关闭：PendingActionCard 会按失效只读渲染，
// 显示「该待办已随轮次关闭失效」，且不给出「批准并应用」入口。
const EXPIRED_ACTION: PendingAction = {
  id: "act_1",
  kind: "profile_change",
  title: "补充「带教与团队机制」事实", // i18n-allow: Agent 提案标题不翻译（US-13.4）
  targetResource: "profile.facts",
  impactSummary: "新增 1 条事实，写入前需你确认", // i18n-allow: Agent 提案影响不翻译（US-13.4）
  requiresTextConfirm: false,
  state: "pending",
}

const CLOSED_TURN_RUN: ProfileCurrentRun = {
  bubbles: BUBBLES,
  pendingActions: [EXPIRED_ACTION],
  turnClosed: true,
}

const LIST_ERROR = "GET /sessions 失败（503）" // i18n-allow: 后端错误详情不翻译

const noop = () => {}

/** 右侧抽屉外壳：左侧用虚线占位表示被遮住的 /profile 页面，右侧是 400px 抽屉。 */
function Drawer({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex h-[640px] max-w-4xl overflow-hidden rounded-xl border border-input bg-background">
      <div className="min-w-0 flex-1 bg-secondary/40 p-6" aria-hidden>
        <div className="h-full rounded-lg border border-dashed border-border bg-card/60" />
      </div>
      <div className="flex w-[400px] flex-col border-l border-border bg-background">{children}</div>
    </div>
  )
}

export default {
  title: "Pages/ProfileAssistantPanel",
  parameters: { layout: "fullscreen" },
}

// —— 新建对话入口：可用 / 运行中禁用 ——

export const NewConversationFiltered = {
  render: () => (
    <Drawer>
      <ProfileAssistantPanel mode="current" currentRun={CURRENT_RUN} onCreate={noop} onContinue={noop} onModeChange={noop} />
    </Drawer>
  ),
}

export const NewConversationDisabled = {
  render: () => (
    <Drawer>
      <ProfileAssistantPanel mode="current" currentRun={CURRENT_RUN} creating onCreate={noop} onContinue={noop} onModeChange={noop} />
    </Drawer>
  ),
}

// —— 历史会话：列表默认 / 空 / 加载 / 错误 ——

export const HistoryList = {
  render: () => (
    <Drawer>
      <ProfileAssistantPanel mode="history" sessions={SESSIONS} activeSessionId={null} onCreate={noop} onSelect={noop} onModeChange={noop} />
    </Drawer>
  ),
}

export const HistoryEmpty = {
  render: () => (
    <Drawer>
      <ProfileAssistantPanel mode="history" sessions={[]} activeSessionId={null} onCreate={noop} onSelect={noop} onModeChange={noop} />
    </Drawer>
  ),
}

export const HistoryLoading = {
  render: () => (
    <Drawer>
      <ProfileAssistantPanel mode="history" activeSessionId={null} onCreate={noop} onSelect={noop} onModeChange={noop} />
    </Drawer>
  ),
}

export const HistoryError = {
  render: () => (
    <Drawer>
      <ProfileAssistantPanel
        mode="history"
        activeSessionId={null}
        error={LIST_ERROR}
        onCreate={noop}
        onSelect={noop}
        onModeChange={noop}
      />
    </Drawer>
  ),
}

// —— 历史会话：选中详情（含压缩历史）与底部继续输入框 ——

export const HistoryDetail = {
  render: () => (
    <Drawer>
      <ProfileAssistantPanel
        mode="history"
        sessions={SESSIONS}
        activeSessionId={SESSIONS[0].id}
        messages={MESSAGES}
        onCreate={noop}
        onSelect={noop}
        onBack={noop}
        onContinue={noop}
        onModeChange={noop}
      />
    </Drawer>
  ),
}

export const HistoryCompacted = {
  render: () => (
    <Drawer>
      <ProfileAssistantPanel
        mode="history"
        sessions={SESSIONS}
        activeSessionId={SESSIONS[0].id}
        messages={COMPACTED}
        onCreate={noop}
        onSelect={noop}
        onBack={noop}
        onContinue={noop}
        onModeChange={noop}
      />
    </Drawer>
  ),
}

// —— 当前对话：含「该待办已随轮次关闭失效」的失效待办 ——

export const CurrentSession = {
  render: () => (
    <Drawer>
      <ProfileAssistantPanel mode="current" currentRun={CLOSED_TURN_RUN} onCreate={noop} onContinue={noop} onModeChange={noop} />
    </Drawer>
  ),
}
