// SCR-108 Run、模式与 PendingAction Panel + DES-004 对话/Run 时间线。
// 当前 Run 模式服务端固化（C-02）；控制事件（批准/拒绝）留在原轮次，不开启新任务轮次。
// 真实接线：approve/reject 走公共 API，turn.updated 经 SSE 触发 run 查询刷新。

import { useEffect, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { approvePendingAction, rejectPendingAction, startRun } from "@/lib/api"
import { agentErrorKey } from "@/lib/agent-error"
import type { AgentRun, ExecutionMode, RunTimelineEvent } from "@/lib/types"
import { subscribeTurnEvents } from "@/lib/turn-events"
import { PendingActionCard } from "@/components/kit/pending-action"
import { RunErrorBlock } from "@/components/kit/run-error"
import { MarkdownMessage } from "@/components/kit/markdown"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/button"
import { Collapsible } from "@base-ui/react/collapsible"
import { cn } from "@/lib/utils"
import { ChevronRight, CircleDashed, MessageSquare, Send, Wrench } from "lucide-react"

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

/** 时间线的渲染分块：普通事件，或一段「推理与工具活动」。 */
type TimelineChunk =
  | { kind: "event"; ev: RunTimelineEvent }
  | { kind: "activity"; id: string; events: RunTimelineEvent[] }

/**
 * 把连续的推理与工具活动合成一个折叠块（issue 3fdec）。
 *
 * 数据模型没有独立的 reasoning 事件：最接近的载体是 tool_progress 与中间 assistant
 * 文本。最后一条 assistant 消息是面向用户的回复，留在折叠块外；其余过程信息默认收起，
 * 只显示条目数，展开后逐行查看。
 */
function groupTimeline(timeline: RunTimelineEvent[]): TimelineChunk[] {
  let lastAgentMessage: RunTimelineEvent | undefined
  for (const ev of timeline) {
    if (ev.kind === "message" && ev.role === "agent") lastAgentMessage = ev
  }
  const chunks: TimelineChunk[] = []
  let activity: RunTimelineEvent[] = []
  const flush = () => {
    if (!activity.length) return
    chunks.push({ kind: "activity", id: "activity:" + activity[0].id, events: activity })
    activity = []
  }
  for (const ev of timeline) {
    const isActivity =
      ev.kind === "tool_progress" ||
      (ev.kind === "message" && ev.role === "agent" && ev !== lastAgentMessage)
    if (isActivity) {
      activity.push(ev)
      continue
    }
    flush()
    chunks.push({ kind: "event", ev })
  }
  flush()
  return chunks
}

export function RunPanel({
  run,
  mode,
  resumeId,
  defaultActivityOpen = false,
}: {
  run?: AgentRun | null
  mode: ExecutionMode
  resumeId: string
  /** 推理与工具活动块的初始展开态；对话进行中可传 true，历史默认折叠。 */
  defaultActivityOpen?: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  // 失败后重试要能重放这次输入；轮次投影里没有 prompt（标准 run 的 turn.message 为空）。
  const [lastPrompt, setLastPrompt] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  // 点击发送后子进程要 1~3s 才建出新轮次；在这之前不能被当前显示的旧轮次（可能已关闭）短路。
  const [awaitingNewRun, setAwaitingNewRun] = useState(false)
  // 当前轮次还有待审批待办时，发送前先显式确认（issue 3fdec）。
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState("")
  const submittedFromRunId = useRef<string | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)

  const decision = useMutation({
    mutationFn: ({ actionId, kind }: { actionId: string; kind: "approve" | "reject" }) =>
      kind === "approve" ? approvePendingAction(actionId) : rejectPendingAction(actionId),
    onMutate: ({ actionId }) => {
      setActionError(null)
      setSubmittingId(actionId)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["active-run", resumeId] })
      // 审批写的是服务端工作副本：不刷新简历查询，编辑器会一直停在旧文档与旧基线（issue a4367）。
      void queryClient.invalidateQueries({ queryKey: ["resume", resumeId] })
      void queryClient.invalidateQueries({ queryKey: ["resumes"] })
    },
    onError: (cause) => setActionError(cause instanceof Error ? cause.message : String(cause)),
    onSettled: () => setSubmittingId(null),
  })

  const start = useMutation({
    mutationFn: (prompt: string) => startRun(resumeId, { prompt, executionMode: mode, sessionId: run?.sessionId }),
    onMutate: () => {
      setStartError(null)
      setStarting(true)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["active-run", resumeId] })
    },
    onError: (cause) => {
      setStarting(false)
      setAwaitingNewRun(false)
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

  // 审批的真正写入发生在批准之后：Agent 拿到授权才 apply 工作副本，轮次随后结算。
  // 只按点击时机刷新会漏掉这次写入，所以轮次状态或待办状态一变就刷新简历查询，
  // 让编辑器的文档、基线与保存状态跟上服务端（issue a4367）。
  const runStateSignature = `${run?.state ?? ""}:${(run?.pendingActions ?? [])
    .map((action) => `${action.id}:${action.state}`)
    .join(",")}`
  const lastRunStateSignature = useRef(runStateSignature)
  useEffect(() => {
    if (lastRunStateSignature.current === runStateSignature) return
    lastRunStateSignature.current = runStateSignature
    void queryClient.invalidateQueries({ queryKey: ["resume", resumeId] })
    void queryClient.invalidateQueries({ queryKey: ["resumes"] })
  }, [runStateSignature, resumeId, queryClient])

  // 新轮次出现（run.id 从提交时的基线变化）即结束等待；超时兜底在轮询 effect 里。
  useEffect(() => {
    if (!awaitingNewRun) return
    if (run?.id === undefined || run.id === submittedFromRunId.current) return
    setAwaitingNewRun(false)
    setStarting(false)
  }, [awaitingNewRun, run?.id])

  // SSE 只在轮次投影真实变化时推送；Agent 的中间回复与工具活动写的是会话消息，
  // 不会改变轮次投影。轮次未关闭时轮询 active-run，让对话持续出现；关闭后停止。
  // 例外：刚点过发送、还在等新轮次时，即使当前显示的旧轮次已关闭也必须继续轮询，
  // 否则第一次刷新（子进程还没建轮次）拿回旧轮次后就再也不会刷新。最多等 60s。
  useEffect(() => {
    const polling = awaitingNewRun || (run?.id !== undefined && run.state !== "turn_closed")
    if (!polling) return
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["active-run", resumeId] })
    }, 1500)
    const stop =
      awaitingNewRun
        ? window.setTimeout(() => {
            setAwaitingNewRun(false)
            setStarting(false)
          }, 60000)
        : undefined
    return () => {
      window.clearInterval(timer)
      if (stop !== undefined) window.clearTimeout(stop)
    }
  }, [awaitingNewRun, run?.id, run?.state, resumeId, queryClient])

  const pendingActions = run?.pendingActions ?? []
  const pendingCount = pendingActions.filter((action) => action.state === "pending").length
  const timelineLength = run?.timeline.length ?? 0

  // 对话区自动滚动到最新一条（issue 3fdec）：新消息 / 新待办 / 启动中写入后跟随到底部。
  // jsdom 没有实现元素的 scrollTo；浏览器里才需要自动滚动。
  useEffect(() => {
    const node = timelineRef.current
    if (node && typeof node.scrollTo === "function") {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" })
    }
  }, [run?.id, timelineLength, pendingActions.length, starting])

  // 轮次已关闭时历史 pending 由 PendingActionCard 按失效只读渲染，发送不会再结算它，因此不拦截。
  const needsSendConfirm = pendingCount > 0 && run?.state !== "turn_closed"

  const approve = (actionId: string) => decision.mutate({ actionId, kind: "approve" })
  const reject = (actionId: string) => decision.mutate({ actionId, kind: "reject" })

  function launch(prompt: string) {
    setInput("")
    setLastPrompt(prompt)
    submittedFromRunId.current = run?.id ?? null
    setAwaitingNewRun(true)
    start.mutate(prompt)
  }

  function submit() {
    const prompt = input.trim()
    if (!prompt || start.isPending) return
    if (needsSendConfirm) {
      setPendingPrompt(prompt)
      setConfirmOpen(true)
      return
    }
    launch(prompt)
  }

  function confirmSend() {
    const prompt = pendingPrompt
    setConfirmOpen(false)
    setPendingPrompt("")
    if (prompt) launch(prompt)
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
      <div ref={timelineRef} className="flex-1 space-y-3 overflow-auto p-3" aria-live="polite">
        {run ? (
          groupTimeline(run.timeline).map((chunk) =>
            chunk.kind === "activity" ? (
              <ActivityBlock key={chunk.id} events={chunk.events} defaultOpen={defaultActivityOpen} />
            ) : (
              <TimelineItem key={chunk.ev.id} ev={chunk.ev} />
            ),
          )
        ) : starting ? (
          <p role="status" className="flex items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <CircleDashed className="size-4 animate-spin" aria-hidden />
            {t("workbench.run.starting")}
          </p>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("workbench.run.empty")}</p>
        )}

        {/* 待确认动作：关闭轮次时由 PendingActionCard 统一按失效只读渲染（历史 pending 兜底只此一份） */}
        {pendingActions.map((action) => (
          <PendingActionCard
            key={action.id}
            action={action}
            turnClosed={run?.state === "turn_closed"}
            onApprove={approve}
            onReject={reject}
            busy={submittingId === action.id}
          />
        ))}

        {/* 运行失败必须可见（issue 4ff97）：类别 + provider/model + key 尾号 + 下一步入口。 */}
        {run?.error ? (
          <RunErrorBlock
            error={run.error}
            onRetry={lastPrompt ? () => launch(lastPrompt) : undefined}
          />
        ) : null}
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

      {/* 有待审批待办时的发送确认：确认后当前轮次才会结算，待办随之作废。 */}
      <Modal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("workbench.run.sendConfirm.title")}
        description={t("workbench.run.sendConfirm.description")}
      >
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            {t("common.actions.cancel")}
          </Button>
          <Button onClick={confirmSend}>{t("workbench.run.sendConfirm.confirm")}</Button>
        </div>
      </Modal>
    </div>
  )
}

/** 推理与工具活动折叠块：折叠态只显示条目数，展开后逐行查看。 */
function ActivityBlock({ events, defaultOpen }: { events: RunTimelineEvent[]; defaultOpen: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-secondary/50 px-2.5 py-1.5">
      <Collapsible.Trigger className="flex w-full items-center gap-2 rounded-md py-0.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ChevronRight className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} aria-hidden />
        {t("workbench.run.activity.summary", { count: events.length })}
      </Collapsible.Trigger>
      <Collapsible.Panel className="mt-1.5 space-y-1.5 border-l border-border pl-3">
        {events.map((ev) =>
          ev.kind === "tool_progress" ? (
            <ToolRow key={ev.id} ev={ev} />
          ) : (
            <p key={ev.id} className="wrap-anywhere text-xs leading-5 text-muted-foreground">
              {ev.text}
            </p>
          ),
        )}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

function ToolRow({ ev }: { ev: RunTimelineEvent }) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Wrench className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">
        <span className="font-mono text-foreground">{ev.toolName}</span>
        {ev.text ? <span> · {ev.text}</span> : null}
      </span>
    </div>
  )
}

function TimelineItem({ ev }: { ev: RunTimelineEvent }) {
  if (ev.kind === "message") {
    const isUser = ev.role === "user"
    return (
      <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
        <div className={cn("wrap-anywhere max-w-[85%] rounded-lg px-3 py-2 text-sm leading-6", isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
          {isUser ? ev.text : <MarkdownMessage text={ev.text} />}
        </div>
      </div>
    )
  }
  if (ev.kind === "tool_progress") {
    return <ToolRow ev={ev} />
  }
  return (
    <div className="flex items-center gap-2 text-xs text-cobalt">
      <CircleDashed className="size-3.5 shrink-0" aria-hidden />
      {ev.text}
    </div>
  )
}
