// 个人资料助手抽屉的展示层：新建对话入口 +「当前对话 / 历史会话」切换 +
// 历史「列表 → 详情 → 底部继续输入框」。纯 props 驱动，不发任何请求；
// 数据与回调由调用方注入，真实接线仍留在 profile-assistant.tsx（本轮不动）。
// 零件复用 session-history.tsx 的 SessionList / SessionDetail / NewConversationEntry，
// 令牌与类沿用既有规范，不新增页面视觉规则。

import { useState, type Ref } from "react"
import { useTranslation } from "react-i18next"
import { Bot, Loader2, Send, User } from "lucide-react"
import { StateBlock } from "@/components/kit/state-block"
import { PendingActionCard } from "@/components/kit/pending-action"
import { RunErrorBlock } from "@/components/kit/run-error"
import {
  NewConversationEntry,
  SessionDetail,
  SessionList,
  type SessionMessage,
  type SessionSummary,
} from "@/components/session-history"
import type { PendingAction, RunError } from "@/lib/types"
import { cn } from "@/lib/utils"

export type ProfileAssistantView = "current" | "history"

/** 当前对话的气泡：与 profile-assistant.tsx 的 buildConversation 输出同形。 */
export interface ProfileAssistantBubble {
  id: string
  role: "user" | "agent"
  text: string
}

export interface ProfileCurrentRun {
  bubbles: ProfileAssistantBubble[]
  /** 待确认的主档改动；轮次已关闭时由 PendingActionCard 按失效只读渲染。 */
  pendingActions?: PendingAction[]
  /** 所属轮次是否已关闭：历史 pending 待办按失效只读渲染，不给出可点入口。 */
  turnClosed?: boolean
  /** 正在等助手回复：显示思考中气泡。 */
  thinking?: boolean
  /** 本轮 run 的失败详情；有值时在气泡下方渲染共享的 RunErrorBlock。 */
  runError?: RunError | null
  /** 重试最近一次输入；缺省时不渲染「重试」入口。 */
  onRetry?: () => void
  /** 待办决策：批准 / 拒绝；缺省时待办按只读渲染。 */
  onApprove?: (actionId: string) => void
  onReject?: (actionId: string) => void
  /** 正在提交的待办 id：禁用重复点击。 */
  busyActionId?: string | null
}

export interface ProfileAssistantPanelProps {
  /** 当前视图；受控，切换由 onModeChange 声明。 */
  mode: ProfileAssistantView
  /** undefined 表示「加载中」；空数组是真正的空态。 */
  sessions?: SessionSummary[]
  /** 历史详情消息；undefined 表示「加载中」，空数组是空会话。 */
  messages?: SessionMessage[]
  /** 列表里高亮的会话；有值时历史视图显示详情。 */
  activeSessionId?: string | null
  /** 当前对话视图的数据；缺省或 null 时显示空态。 */
  currentRun?: ProfileCurrentRun | null
  /** 当前视图的错误：历史视图透给列表 / 详情，当前对话视图渲染成错误条。 */
  error?: string
  /** 新建对话请求进行中：入口禁用并切换文案。 */
  creating?: boolean
  onCreate?: () => void
  onSelect?: (id: string) => void
  onBack?: () => void
  /** 发送一条消息（当前对话与历史详情共用）；作用域由调用方按 mode 决定。 */
  onContinue?: (text: string) => void
  onModeChange?: (mode: ProfileAssistantView) => void
  /** 正文滚动容器 ref：调用方用它在新消息到达时滚到底部。 */
  bodyRef?: Ref<HTMLDivElement>
}

export function ProfileAssistantPanel({
  mode,
  sessions,
  messages,
  activeSessionId,
  currentRun,
  error,
  creating = false,
  onCreate,
  onSelect,
  onBack,
  onContinue,
  onModeChange,
  bodyRef,
}: ProfileAssistantPanelProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState("")
  const selected = sessions?.find((session) => session.id === activeSessionId)
  const bodyId = "profile-assistant-panel-body"

  function submit() {
    const value = draft.trim()
    if (!value) return
    setDraft("")
    onContinue?.(value)
  }

  const composer = (placeholder: string, hint?: string) => (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="border-t border-border p-3"
    >
      {hint ? <p className="mb-2 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing && event.keyCode !== 229) {
              event.preventDefault()
              submit()
            }
          }}
          rows={2}
          aria-label={placeholder}
          placeholder={placeholder}
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label={t("profile.assistant.send")}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  )

  const tabClass = (active: boolean) =>
    cn(
      "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
    )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-border p-3">
        <NewConversationEntry disabled={creating} onCreate={onCreate} />
        <div
          role="tablist"
          aria-label={t("profile.assistant.panel.tabsLabel")}
          className="flex gap-1 rounded-lg border border-border bg-card p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "current"}
            aria-controls={bodyId}
            onClick={() => onModeChange?.("current")}
            className={tabClass(mode === "current")}
          >
            {t("sessionHistory.currentChat")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "history"}
            aria-controls={bodyId}
            onClick={() => onModeChange?.("history")}
            className={tabClass(mode === "history")}
          >
            {t("sessionHistory.title")}
          </button>
        </div>
      </div>

      <div id={bodyId} ref={bodyRef} role="tabpanel" className="min-h-0 flex-1 overflow-y-auto p-4">
        {mode === "current" ? (
          <CurrentConversation run={currentRun} error={error} />
        ) : activeSessionId ? (
          <SessionDetail session={selected} messages={messages} error={error} onBack={onBack} />
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">{t("profile.assistant.panel.historyHint")}</p>
            <SessionList sessions={sessions} error={error} activeId={activeSessionId ?? undefined} onSelect={onSelect} />
          </>
        )}
      </div>

      {mode === "current"
        ? composer(t("profile.assistant.placeholder"))
        : activeSessionId
          ? composer(t("sessionHistory.continue.placeholder"), t("sessionHistory.continue.hint"))
          : null}
    </div>
  )
}

/** 当前对话视图：气泡 + 失效待办 + 思考中；无内容时退回空态。 */
function CurrentConversation({ run, error }: { run?: ProfileCurrentRun | null; error?: string }) {
  const { t } = useTranslation()
  const bubbles = run?.bubbles ?? []
  const pendingActions = run?.pendingActions ?? []
  const thinking = run?.thinking === true
  const empty = bubbles.length === 0 && pendingActions.length === 0 && !thinking

  return (
    <div className="space-y-4" aria-live="polite">
      {error ? (
        <p role="alert" className="rounded-md bg-coral/10 px-2.5 py-1.5 text-xs font-medium text-coral">
          {error}
        </p>
      ) : null}

      {empty ? (
        <StateBlock
          kind="empty"
          title={t("profile.assistant.panel.currentEmptyTitle")}
          description={t("profile.assistant.panel.currentEmptyDescription")}
        />
      ) : (
        bubbles.map((bubble) =>
          bubble.role === "user" ? (
            <div key={bubble.id} className="flex justify-end gap-2.5">
              <div className="max-w-[80%] break-words rounded-2xl rounded-tr-sm bg-cobalt px-3.5 py-2.5 text-sm leading-6 text-primary-foreground">
                {bubble.text}
              </div>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cobalt/15 text-cobalt">
                <User className="size-4" aria-hidden />
              </span>
            </div>
          ) : (
            <div key={bubble.id} className="flex gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cobalt/15 text-cobalt">
                <Bot className="size-4" aria-hidden />
              </span>
              <div className="max-w-[80%] break-words rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-6 text-foreground">
                {bubble.text}
              </div>
            </div>
          ),
        )
      )}

      {pendingActions.map((action) => (
        <PendingActionCard
          key={action.id}
          action={action}
          turnClosed={run?.turnClosed}
          onApprove={run?.onApprove}
          onReject={run?.onReject}
          busy={run?.busyActionId === action.id}
        />
      ))}

      {run?.runError ? <RunErrorBlock error={run.runError} onRetry={run.onRetry} /> : null}

      {thinking ? (
        <div className="flex gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cobalt/15 text-cobalt">
            <Bot className="size-4" aria-hidden />
          </span>
          <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> {t("profile.assistant.thinking")}
          </div>
        </div>
      ) : null}
    </div>
  )
}
