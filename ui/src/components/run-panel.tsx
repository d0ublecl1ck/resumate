// SCR-108 Run、模式与 PendingAction Panel + DES-004 对话/Run 时间线。
// 当前 Run 模式服务端固化（C-02）；控制事件（批准/拒绝/取消）留在原轮次，
// 不开启新任务轮次。这里为前端演示，交互更新本地状态。

import { useState } from "react"
import { useTranslation } from "react-i18next"
import type { AgentRun, ExecutionMode, RunTimelineEvent } from "@/lib/types"
import { PendingActionCard } from "@/components/kit/pending-action"
import { cn } from "@/lib/utils"
import { CircleDashed, MessageSquare, Send, Wrench } from "lucide-react"

const RUN_STATE_TONE: Record<AgentRun["state"], string> = {
  running: "text-cobalt",
  awaiting_confirm: "text-coral",
  approved: "text-cobalt",
  rejected: "text-muted-foreground",
  cancelling: "text-coral",
  partial_success: "text-gold",
  over_budget: "text-coral",
  failed: "text-coral",
  frozen: "text-muted-foreground",
  turn_closed: "text-muted-foreground",
}

export function RunPanel({ run: initialRun, mode }: { run?: AgentRun; mode: ExecutionMode }) {
  const { t } = useTranslation()
  const [run, setRun] = useState(initialRun)
  const [input, setInput] = useState("")

  function approve(actionId: string) {
    setRun((r) =>
      r
        ? {
            ...r,
            state: "approved",
            pendingActions: r.pendingActions.map((a) => (a.id === actionId ? { ...a, state: "approved" as const } : a)),
            timeline: [...r.timeline, sysEvent(t("workbench.run.approvedEvent"))],
          }
        : r,
    )
  }
  function reject(actionId: string) {
    setRun((r) =>
      r
        ? {
            ...r,
            state: "rejected",
            pendingActions: r.pendingActions.map((a) => (a.id === actionId ? { ...a, state: "rejected" as const } : a)),
            timeline: [...r.timeline, sysEvent(t("workbench.run.rejectedEvent"))],
          }
        : r,
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Run 头部：当前模式 + 状态 + 预算 */}
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <MessageSquare className="size-4 text-cobalt" aria-hidden /> {t("workbench.run.conversation")}
          </span>
          {run ? <span className={cn("text-xs font-semibold", RUN_STATE_TONE[run.state])}>{t("workbench.runState." + run.state, { defaultValue: run.state })}</span> : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>{t("workbench.run.currentModePrefix")}<span className="font-medium text-foreground">{t("common.executionMode." + (run?.executionMode ?? mode))}</span>{t("workbench.run.currentModeSuffix")}</span>
          {run ? <span>{t("workbench.run.budget", { usedTokens: run.budget.usedTokens, maxTokens: run.budget.maxTokens, usedTurns: run.budget.usedTurns, maxTurns: run.budget.maxTurns })}</span> : null}
        </div>
      </div>

      {/* 时间线 */}
      <div className="flex-1 space-y-3 overflow-auto p-3" aria-live="polite">
        {run ? (
          run.timeline.map((ev) => <TimelineItem key={ev.id} ev={ev} />)
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("workbench.run.empty")}</p>
        )}

        {/* 待确认动作 */}
        {run?.pendingActions.map((action) => (
          <PendingActionCard key={action.id} action={action} onApprove={approve} onReject={reject} />
        ))}
      </div>

      {/* 输入 */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                setInput("")
              }
            }}
            rows={2}
            placeholder={t("workbench.run.inputPlaceholder")}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            aria-label={t("workbench.run.inputAria")}
          />
          <button className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" aria-label={t("workbench.run.sendAria")}>
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function TimelineItem({ ev }: { ev: RunTimelineEvent }) {
  if (ev.kind === "message") {
    const isUser = ev.role === "user"
    return (
      <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
        <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm leading-6", isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
          {ev.text}
        </div>
      </div>
    )
  }
  if (ev.kind === "tool_progress") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Wrench className="size-3.5 shrink-0" aria-hidden />
        <span className="font-mono">{ev.toolName}</span>
        <span>·</span>
        <span>{ev.text}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 text-xs text-cobalt">
      <CircleDashed className="size-3.5 shrink-0" aria-hidden />
      {ev.text}
    </div>
  )
}

function sysEvent(text: string): RunTimelineEvent {
  return { id: `ev_${Math.random().toString(36).slice(2, 8)}`, kind: "finalize", at: new Date().toISOString(), text }
}
