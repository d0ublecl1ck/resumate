// SCR-108 Run、模式与 PendingAction Panel + DES-004 对话/Run 时间线。
// 当前 Run 模式服务端固化（C-02）；控制事件（批准/拒绝/取消）留在原轮次，
// 不开启新任务轮次。这里为前端演示，交互更新本地状态。

import { useState } from "react"
import type { AgentRun, ExecutionMode, RunTimelineEvent } from "@/lib/types"
import { PendingActionCard } from "@/components/kit/pending-action"
import { cn } from "@/lib/utils"
import { CircleDashed, MessageSquare, Send, Wrench } from "lucide-react"

const RUN_STATE_LABEL: Record<AgentRun["state"], { label: string; tone: string }> = {
  running: { label: "运行中", tone: "text-cobalt" },
  awaiting_confirm: { label: "待确认", tone: "text-coral" },
  approved: { label: "已批准", tone: "text-cobalt" },
  rejected: { label: "已拒绝", tone: "text-muted-foreground" },
  cancelling: { label: "取消中", tone: "text-coral" },
  partial_success: { label: "部分成功", tone: "text-gold" },
  over_budget: { label: "超预算", tone: "text-coral" },
  failed: { label: "失败", tone: "text-coral" },
  frozen: { label: "权限冻结", tone: "text-muted-foreground" },
  turn_closed: { label: "轮次已关闭", tone: "text-muted-foreground" },
}

export function RunPanel({ run: initialRun, mode }: { run?: AgentRun; mode: ExecutionMode }) {
  const [run, setRun] = useState(initialRun)
  const [input, setInput] = useState("")

  function approve(actionId: string) {
    setRun((r) =>
      r
        ? {
            ...r,
            state: "approved",
            pendingActions: r.pendingActions.map((a) => (a.id === actionId ? { ...a, state: "approved" as const } : a)),
            timeline: [...r.timeline, sysEvent("已批准修改，已应用到本轮 Working Copy（未新建正式版本）")],
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
            timeline: [...r.timeline, sysEvent("已拒绝修改，未写入 Working Copy")],
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
            <MessageSquare className="size-4 text-cobalt" aria-hidden /> Agent 对话
          </span>
          {run ? <span className={cn("text-xs font-semibold", RUN_STATE_LABEL[run.state].tone)}>{RUN_STATE_LABEL[run.state].label}</span> : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>当前 Run 模式：<span className="font-medium text-foreground">{run?.executionMode ?? mode}</span>（服务端固化）</span>
          {run ? <span>预算 {run.budget.usedTokens}/{run.budget.maxTokens} tokens · {run.budget.usedTurns}/{run.budget.maxTurns} 轮</span> : null}
        </div>
      </div>

      {/* 时间线 */}
      <div className="flex-1 space-y-3 overflow-auto p-3" aria-live="polite">
        {run ? (
          run.timeline.map((ev) => <TimelineItem key={ev.id} ev={ev} />)
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">还没有对话。描述你的编辑意图，Agent 会生成待确认的修改。</p>
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
            placeholder="描述编辑意图，例如：突出我的性能优化经历…（⌘↵ 发送）"
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            aria-label="对话输入"
          />
          <button className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90" aria-label="发送">
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
