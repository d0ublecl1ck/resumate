// SCR-108 Run、模式与 PendingAction Panel + DES-004 对话/Run 时间线。
// 当前 Run 模式服务端固化（C-02）；控制事件（批准/拒绝）留在原轮次，不开启新任务轮次。
// 真实接线：approve/reject 走公共 API，turn.updated 经 SSE 触发 run 查询刷新。

import { useEffect, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { approvePendingAction, rejectPendingAction, startRun } from "@/lib/api"
import { agentErrorKey } from "@/lib/agent-error"
import type { AgentRun, ExecutionMode, RunTimelineEvent } from "@/lib/types"
import { subscribeTurnEvents } from "@/lib/turn-events"
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

export function RunPanel({ run, mode, resumeId }: { run?: AgentRun | null; mode: ExecutionMode; resumeId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const decision = useMutation({
    mutationFn: ({ actionId, kind }: { actionId: string; kind: "approve" | "reject" }) =>
      kind === "approve" ? approvePendingAction(actionId) : rejectPendingAction(actionId),
    onMutate: ({ actionId }) => {
      setActionError(null)
      setSubmittingId(actionId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["active-run", resumeId] })
    },
    onError: (cause) => setActionError(cause instanceof Error ? cause.message : String(cause)),
    onSettled: () => setSubmittingId(null),
  })

  const start = useMutation({
    mutationFn: (prompt: string) => startRun(resumeId, { prompt, executionMode: mode }),
    onMutate: () => {
      setStartError(null)
      setStarting(true)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["active-run", resumeId] })
    },
    onError: (cause) => {
      setStarting(false)
      setStartError(t(agentErrorKey(cause)))
    },
  })

  // StrictMode 安全：每次挂载新建订阅，cleanup 关闭 EventSource（不做一次性 ref 守卫）。
  useEffect(() => {
    if (!run?.id) return
    return subscribeTurnEvents(run.id, {
      onUpdate: () => {
        void queryClient.invalidateQueries({ queryKey: ["active-run", resumeId] })
      },
    })
  }, [run?.id, resumeId, queryClient])

  // 子进程创建轮次有延迟：run 出现前轮询 active-run，最多 60s，避免立刻显示「无轮次」。
  useEffect(() => {
    if (!starting || run?.id) return
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["active-run", resumeId] })
    }, 1500)
    const stop = window.setTimeout(() => setStarting(false), 60000)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(stop)
    }
  }, [starting, run?.id, resumeId, queryClient])

  // run 出现后结束「正在启动」。
  useEffect(() => {
    if (run?.id) setStarting(false)
  }, [run?.id])

  const approve = (actionId: string) => decision.mutate({ actionId, kind: "approve" })
  const reject = (actionId: string) => decision.mutate({ actionId, kind: "reject" })

  function submit() {
    const prompt = input.trim()
    if (!prompt || start.isPending) return
    setInput("")
    start.mutate(prompt)
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
        {startError ? (
          <p role="alert" className="mt-2 rounded-md bg-coral/10 px-2.5 py-1.5 text-xs font-medium text-coral">
            {startError}
          </p>
        ) : null}
        {actionError ? (
          <p role="alert" className="mt-2 rounded-md bg-coral/10 px-2.5 py-1.5 text-xs font-medium text-coral">
            {t("workbench.run.actionError", { message: actionError })}
          </p>
        ) : null}
      </div>

      {/* 时间线 */}
      <div className="flex-1 space-y-3 overflow-auto p-3" aria-live="polite">
        {run ? (
          run.timeline.map((ev) => <TimelineItem key={ev.id} ev={ev} />)
        ) : starting ? (
          <p role="status" className="flex items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <CircleDashed className="size-4 animate-spin" aria-hidden />
            {t("workbench.run.starting")}
          </p>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("workbench.run.empty")}</p>
        )}

        {/* 待确认动作 */}
        {run?.pendingActions.map((action) => (
          <PendingActionCard key={action.id} action={action} onApprove={approve} onReject={reject} busy={submittingId === action.id} />
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
                submit()
              }
            }}
            rows={2}
            disabled={start.isPending}
            aria-busy={start.isPending}
            placeholder={t("workbench.run.inputPlaceholder")}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label={t("workbench.run.inputAria")}
          />
          <button
            type="button"
            onClick={submit}
            disabled={start.isPending}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t("workbench.run.sendAria")}
          >
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
