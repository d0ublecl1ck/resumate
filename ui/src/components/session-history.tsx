// 历史会话（SCR-004 侧栏入口）：会话列表与会话详情（消息流）。
// 纯展示组件：数据由调用方注入；本期只做 Storybook，不接真实端点、不动路由。
// 后端会话表只有 id / createdAt / lastActiveAt，没有 title / messageCount：
// 这两个字段是可选展示入参，缺失时用 i18n 兜底，绝不渲染 undefined。
// 视觉复用既有令牌与组件（card-soft / border-input / cobalt / font-serif / StateBlock / Button），不新增页面视觉规则。
import dayjs from "dayjs"
import { MessageSquarePlus, MessageSquareText } from "lucide-react"
import { useTranslation } from "react-i18next"
import { StateBlock } from "@/components/kit/state-block"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Mirrors GET /sessions items, plus optional display-only fields. */
export interface SessionSummary {
  id: string
  createdAt: string
  lastActiveAt: string
  /** 展示层派生标题（例如来自首条用户消息）；后端暂无该字段，缺失即兜底。 */
  title?: string
  /** 展示层消息数；后端暂无该字段，缺失即不渲染。 */
  messageCount?: number
}

export type SessionMessageRole = "system" | "user" | "assistant" | "tool"

/** Mirrors GET /sessions/{id}/messages items; content is arbitrary JSON. */
export interface SessionMessage {
  id: string
  seq: number
  role: SessionMessageRole
  content: unknown
}

const COMPACTED_MARKER = "[compacted-history]"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

type RelativeUnit = "minutes" | "hours" | "days" | "months" | "years"

function formatTime(value: string): string {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm") : value
}

/** Short, readable id: the backend ids are prefixed, the tail is enough here. */
export function shortSessionId(id: string): string {
  return id.length > 12 ? id.slice(-12) : id
}

export function sessionLabel(id: string, lastActiveAt: string): string {
  return `${formatTime(lastActiveAt)} · ${shortSessionId(id)}`
}

/**
 * 相对时间只描述「最近活跃」的新鲜度；无效时间返回 null，由调用方退回绝对时间串。
 * justNow 与各时间单位都走 i18n，不硬编码中英文。
 */
function relativeTime(value: string): { unit: RelativeUnit; n: number } | "justNow" | null {
  const parsed = dayjs(value)
  if (!parsed.isValid()) return null
  const diff = Math.max(0, Date.now() - parsed.valueOf())
  if (diff < MINUTE_MS) return "justNow"
  if (diff < HOUR_MS) return { unit: "minutes", n: Math.floor(diff / MINUTE_MS) }
  if (diff < DAY_MS) return { unit: "hours", n: Math.floor(diff / HOUR_MS) }
  if (diff < 30 * DAY_MS) return { unit: "days", n: Math.floor(diff / DAY_MS) }
  if (diff < 365 * DAY_MS) return { unit: "months", n: Math.floor(diff / (30 * DAY_MS)) }
  return { unit: "years", n: Math.floor(diff / (365 * DAY_MS)) }
}

/** 列表项第二行：最近活跃相对时间 +（可选）消息数；克制到两段，不出现会话 ID。 */
function SessionMeta({ session }: { session: SessionSummary }) {
  const { t } = useTranslation()
  const relative = relativeTime(session.lastActiveAt)
  const time =
    relative === null
      ? formatTime(session.lastActiveAt)
      : relative === "justNow"
        ? t("sessionHistory.relative.justNow")
        : t("sessionHistory.relative." + relative.unit, { n: relative.n })

  const parts = [t("sessionHistory.relativeTime", { time })]
  if (session.messageCount !== undefined) {
    parts.push(t("sessionHistory.messageCount", { n: session.messageCount }))
  }

  return <span className="mt-1 block text-xs text-muted-foreground">{parts.join(" · ")}</span>
}

/** 时间分组：按最近活跃时间与「今天零点」的日历日差归档。 */
export type SessionBucket = "today" | "yesterday" | "last7Days" | "last30Days" | "earlier"

const SESSION_BUCKETS: SessionBucket[] = ["today", "yesterday", "last7Days", "last30Days", "earlier"]

export function sessionBucket(lastActiveAt: string, now: dayjs.Dayjs = dayjs()): SessionBucket {
  const parsed = dayjs(lastActiveAt)
  // 无效时间不能丢行：归入「更早」。
  if (!parsed.isValid()) return "earlier"
  const days = now.startOf("day").diff(parsed.startOf("day"), "day")
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days <= 7) return "last7Days"
  if (days <= 30) return "last30Days"
  return "earlier"
}

/** 分组顺序固定：今天 → 昨天 → 7 天内 → 30 天内 → 更早；空组由调用方跳过。 */
export function groupSessionsByTime(
  sessions: SessionSummary[],
  now: dayjs.Dayjs = dayjs(),
): { bucket: SessionBucket; sessions: SessionSummary[] }[] {
  const grouped = new Map<SessionBucket, SessionSummary[]>()
  for (const session of sessions) {
    const bucket = sessionBucket(session.lastActiveAt, now)
    const bucketItems = grouped.get(bucket)
    if (bucketItems) bucketItems.push(session)
    else grouped.set(bucket, [session])
  }
  return SESSION_BUCKETS.map((bucket) => ({ bucket, sessions: grouped.get(bucket) ?? [] })).filter(
    (group) => group.sessions.length > 0,
  )
}

function messageText(message: SessionMessage): string {
  const content = message.content
  if (typeof content === "string") return content
  if (content && typeof content === "object") {
    const record = content as Record<string, unknown>
    if (typeof record.content === "string") return record.content
    const calls = record.toolCalls
    if (Array.isArray(calls) && calls.length > 0) {
      const names = calls
        .map((call) => (call && typeof call === "object" ? String((call as Record<string, unknown>).name ?? "") : ""))
        .filter(Boolean)
      if (names.length > 0) return names.join(", ")
    }
  }
  try {
    return JSON.stringify(content) ?? ""
  } catch {
    return String(content)
  }
}

function toolCallNames(message: SessionMessage): string[] {
  const content = message.content
  if (!content || typeof content !== "object") return []
  const calls = (content as Record<string, unknown>).toolCalls
  if (!Array.isArray(calls)) return []
  return calls
    .map((call) => (call && typeof call === "object" ? String((call as Record<string, unknown>).name ?? "") : ""))
    .filter(Boolean)
}

export interface SessionListProps {
  /** undefined means "still loading"; an empty array is the real empty state. */
  sessions?: SessionSummary[]
  error?: string
  activeId?: string
  onSelect?: (id: string) => void
}

export function SessionList({ sessions, error, activeId, onSelect }: SessionListProps) {
  const { t } = useTranslation()

  if (error !== undefined) {
    return <StateBlock kind="error" title={t("sessionHistory.list.errorTitle")} description={error || t("sessionHistory.list.errorDescription")} />
  }
  if (sessions === undefined) {
    return <StateBlock kind="loading" title={t("sessionHistory.list.loading")} />
  }
  if (sessions.length === 0) {
    return (
      <StateBlock
        kind="empty"
        title={t("sessionHistory.list.emptyTitle")}
        description={t("sessionHistory.list.emptyDescription")}
      />
    )
  }

  // 选中一个「刚创建还没发消息」的会话时，提示这不是空列表而是空会话。
  const showNewSessionHint = sessions.some((session) => session.id === activeId && session.messageCount === 0)
  // 一行一个会话（一个会话含若干轮消息）；按最近活跃时间分组，空组不渲染。
  const groups = groupSessionsByTime(sessions)

  return (
    <>
      {showNewSessionHint ? (
        <StateBlock
          kind="empty"
          className="mb-3"
          title={t("sessionHistory.list.emptyConversationTitle")}
          description={t("sessionHistory.list.emptyConversationDescription")}
        />
      ) : null}
      <div className="space-y-4">
        {groups.map((group) => {
          const groupLabel = t(`sessionHistory.groups.${group.bucket}`)
          return (
            <section key={group.bucket} aria-label={groupLabel}>
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{groupLabel}</h3>
              <ul className="space-y-2">
                {group.sessions.map((session) => {
                  const active = session.id === activeId
                  // 行主文案是话题标题；后端还没返回标题时用「未命名对话」兜底，绝不渲染 undefined。
                  const title = session.title?.trim() || t("sessionHistory.untitled")
                  return (
                    <li key={session.id}>
                      <button
                        type="button"
                        onClick={() => onSelect?.(session.id)}
                        aria-current={active ? "true" : undefined}
                        className={cn(
                          "w-full rounded-lg border border-input bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary",
                          active && "border-cobalt bg-cobalt/5",
                        )}
                      >
                        <span className="wrap-anywhere block font-serif text-base font-bold text-foreground">{title}</span>
                        <SessionMeta session={session} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}

export interface NewConversationEntryProps {
  /** true 表示创建请求进行中：按钮禁用并切换文案。 */
  disabled?: boolean
  onCreate?: () => void
}

/** 新建对话入口：全宽主按钮 + MessageSquarePlus；提交中禁用，避免重复发起。 */
export function NewConversationEntry({ disabled = false, onCreate }: NewConversationEntryProps) {
  const { t } = useTranslation()
  return (
    <Button type="button" onClick={onCreate} disabled={disabled} className="w-full justify-center gap-2">
      <MessageSquarePlus aria-hidden />
      {disabled ? t("sessionHistory.newConversation.creating") : t("sessionHistory.newConversation.create")}
    </Button>
  )
}

export interface SessionDetailProps {
  session?: SessionSummary
  /** undefined means "still loading"; an empty array is a real empty session. */
  messages?: SessionMessage[]
  error?: string
  onBack?: () => void
}

export function SessionDetail({ session, messages, error, onBack }: SessionDetailProps) {
  const { t } = useTranslation()

  const title = session
    ? session.title?.trim() || t("sessionHistory.untitledWithTime", { time: formatTime(session.lastActiveAt) })
    : t("sessionHistory.title")

  return (
    <section aria-label={t("sessionHistory.title")} className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cobalt/10 text-cobalt" aria-hidden>
          <MessageSquareText className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="wrap-anywhere font-serif text-lg font-bold text-foreground">{title}</h2>
          {session ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("sessionHistory.idLabel", { id: shortSessionId(session.id) })}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">{t("sessionHistory.derivedHint")}</p>
        </div>
      </header>

      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          {t("sessionHistory.detail.back")}
        </button>
      ) : null}

      {error !== undefined ? (
        <StateBlock kind="error" title={t("sessionHistory.detail.errorTitle")} description={error || t("sessionHistory.detail.errorDescription")} />
      ) : messages === undefined ? (
        <StateBlock kind="loading" title={t("sessionHistory.detail.loading")} />
      ) : messages.length === 0 ? (
        <StateBlock
          kind="empty"
          title={t("sessionHistory.detail.emptyTitle")}
          description={t("sessionHistory.detail.emptyDescription")}
        />
      ) : (
        <ol className="space-y-3">
          {messages.map((message) => {
            const text = messageText(message)
            const compacted = message.role === "system" && text.startsWith(COMPACTED_MARKER)
            const body = compacted ? text.slice(COMPACTED_MARKER.length).trim() : text
            const calls = toolCallNames(message)
            return (
              <li
                key={message.id}
                className={cn(
                  "rounded-lg border px-3 py-2.5",
                  compacted ? "border-cobalt bg-cobalt/5" : "border-input bg-card",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-foreground">
                    {compacted ? t("sessionHistory.detail.compactedTitle") : t(`sessionHistory.detail.role.${message.role}`)}
                  </span>
                  <span className="text-muted-foreground">{t("sessionHistory.detail.seqHint", { seq: message.seq })}</span>
                  {compacted ? (
                    <span className="rounded-full bg-cobalt/10 px-2 py-0.5 text-cobalt">
                      {t("sessionHistory.detail.compactedHint")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{body}</p>
                {calls.length > 0
                  ? calls.map((name) => (
                      <p key={name} className="mt-1 text-xs text-muted-foreground">
                        {t("sessionHistory.detail.toolCall", { name })}
                      </p>
                    ))
                  : null}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
