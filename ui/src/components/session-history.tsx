// 历史会话（SCR-004 侧栏入口）：会话列表与会话详情（消息流）。
// 纯展示组件：数据由调用方注入；本期只做 Storybook，不接真实端点、不动路由。
// 后端会话表没有 title / summary 字段，所以列表标题只能由 lastActiveAt 派生——
// 这里不编造标题字段，并在文案里如实说明用时间代替。
// 视觉复用既有令牌与组件（card-soft / primary / cobalt / font-serif / StateBlock），不新增页面视觉规则。
import dayjs from "dayjs"
import { useTranslation } from "react-i18next"
import { MessageSquareText } from "lucide-react"
import { StateBlock } from "@/components/kit/state-block"
import { cn } from "@/lib/utils"

/** Mirrors GET /sessions items; no title field exists on the backend yet. */
export interface SessionSummary {
  id: string
  createdAt: string
  lastActiveAt: string
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

  return (
    <ul aria-label={t("sessionHistory.title")} className="space-y-2">
      {sessions.map((session) => {
        const active = session.id === activeId
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
              <span className="block font-serif text-base font-bold text-foreground">
                {t("sessionHistory.derivedLabel", { time: formatTime(session.lastActiveAt) })}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("sessionHistory.idLabel", { id: shortSessionId(session.id) })}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
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

  return (
    <section aria-label={t("sessionHistory.title")} className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cobalt/10 text-cobalt" aria-hidden>
          <MessageSquareText className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-bold text-foreground">
            {session
              ? t("sessionHistory.derivedLabel", { time: formatTime(session.lastActiveAt) })
              : t("sessionHistory.title")}
          </h2>
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
