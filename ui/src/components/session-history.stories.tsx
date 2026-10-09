// Storybook confirmation artifact for 历史会话（SCR-004）：新建入口 + 列表 + 详情。
// 纯展示组件 + 注入数据：不接真实端点、不动路由、不改 lib/api.ts。
// 数据形状镜像后端契约（GET /sessions、GET /sessions/{id}/messages）；
// title / messageCount 是后端暂未提供的展示层可选入参，story 显式注入以确认派生与兜底。
import type { SessionMessage, SessionSummary } from "@/components/session-history"
import { NewConversationEntry, SessionDetail, SessionList } from "@/components/session-history"

// 无 title / messageCount：走「未命名对话 + 时间」与 id 兜底。
const SESSIONS: SessionSummary[] = [
  { id: "ses_000000000001", createdAt: "2026-09-30T09:00:00Z", lastActiveAt: "2026-10-01T02:10:00Z" },
  { id: "ses_000000000002", createdAt: "2026-09-29T08:00:00Z", lastActiveAt: "2026-09-30T18:00:00Z" },
]

// 展示层注入的派生标题与消息数（后端暂未返回）。
// i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
const TITLED_SESSIONS: SessionSummary[] = [
  { ...SESSIONS[0], title: "把工作经历里的性能优化成果提前", messageCount: 12 }, // i18n-allow: 用户内容不翻译
  { ...SESSIONS[1], title: "为美团高级前端岗位定制摘要", messageCount: 3 }, // i18n-allow: 用户内容不翻译
]

const LONG_TITLE_SESSION: SessionSummary = {
  id: "ses_000000000009",
  createdAt: "2026-09-20T09:00:00Z",
  lastActiveAt: "2026-09-21T02:10:00Z",
  // 超长标题用于验证折行；用户内容按 US-13.4 不翻译
  title: "把工作经历里的性能优化成果提前到第一条并补充量化指标与前后对比数据同时调整排版让招聘方一眼看到重点", // i18n-allow: 用户内容不翻译
  messageCount: 8,
}

const NEW_SESSION: SessionSummary = {
  id: "ses_00000000000a",
  createdAt: "2026-10-01T02:10:00Z",
  lastActiveAt: "2026-10-01T02:10:00Z",
  title: "新建对话", // i18n-allow: 用户内容不翻译
  messageCount: 0,
}

const LONG_TITLES_FOR_LIST = [
  "把项目经历第二条改得更量化", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "补充一段云原生迁移经历", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "把个人摘要压缩到两行", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "把教育经历提前到技能之前", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "调整技能关键词排序", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "补充一段开源贡献经历", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "把实习经历改成项目制写法", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "为投递 A 岗位定制版本", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "为投递 B 岗位定制版本", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "统一各段落的时态", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "补充数据指标口径说明", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "删掉重复的自我评价", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "把获奖经历并进教育经历", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "把技术栈按熟练度分组", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "补充一段跨团队协作事实", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "把英文缩写展开成中文", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "调整工作经历的时间倒序", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "补充一段性能优化前后对比", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "把职责与成果分点列出", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
  "核对联系方式与作品链接", // i18n-allow: 会话标题来自用户消息，按 US-13.4 不翻译
]

// 20 条固定数据：验证列表可滚动，序号只影响 id 与消息数，标题循环使用同一批用户内容。
const LONG_SESSIONS: SessionSummary[] = Array.from({ length: 20 }, (_, index) => ({
  id: `ses_${String(index + 11).padStart(12, "0")}`,
  createdAt: "2026-09-20T09:00:00Z",
  lastActiveAt: "2026-09-21T02:10:00Z",
  title: LONG_TITLES_FOR_LIST[index % LONG_TITLES_FOR_LIST.length],
  messageCount: index + 1,
}))

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

// —— 新建对话入口 ——

export const NewConversationDefault = {
  render: () => (
    <Frame>
      <div className="space-y-3">
        <NewConversationEntry onCreate={() => {}} />
      </div>
    </Frame>
  ),
}

export const NewConversationDisabled = {
  render: () => (
    <Frame>
      <div className="space-y-3">
        <NewConversationEntry disabled onCreate={() => {}} />
      </div>
    </Frame>
  ),
}

// —— 列表：派生标题 / 无标题兜底 / 选中态 / 超长标题 / 长列表 / 新会话空态 ——

export const ListWithTitles = {
  render: () => (
    <Frame>
      <SessionList sessions={TITLED_SESSIONS} onSelect={() => {}} />
    </Frame>
  ),
}

export const ListUntitledFallback = {
  render: () => (
    <Frame>
      <SessionList sessions={SESSIONS} onSelect={() => {}} />
    </Frame>
  ),
}

export const ListSelected = {
  render: () => (
    <Frame>
      <SessionList sessions={TITLED_SESSIONS} activeId={TITLED_SESSIONS[0].id} onSelect={() => {}} />
    </Frame>
  ),
}

export const ListLongTitle = {
  render: () => (
    <Frame>
      <SessionList sessions={[LONG_TITLE_SESSION, ...TITLED_SESSIONS]} activeId={LONG_TITLE_SESSION.id} onSelect={() => {}} />
    </Frame>
  ),
}

export const ListLong = {
  render: () => (
    <Frame>
      <SessionList sessions={LONG_SESSIONS} activeId={LONG_SESSIONS[0].id} onSelect={() => {}} />
    </Frame>
  ),
}

export const ListNewSessionEmpty = {
  render: () => (
    <Frame>
      <SessionList sessions={[NEW_SESSION]} activeId={NEW_SESSION.id} onSelect={() => {}} />
    </Frame>
  ),
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

// —— 组合页：新建入口 + 列表 + 详情 ——

export const CompositePage = {
  render: () => (
    <Frame>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          <NewConversationEntry onCreate={() => {}} />
          <SessionList sessions={TITLED_SESSIONS} activeId={TITLED_SESSIONS[0].id} onSelect={() => {}} />
        </div>
        <SessionDetail session={TITLED_SESSIONS[0]} messages={MESSAGES} onBack={() => {}} />
      </div>
    </Frame>
  ),
}

// —— 详情 ——

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
