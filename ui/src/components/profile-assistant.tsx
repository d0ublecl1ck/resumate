// 个人资料助手：主档的对话入口。真实接线到 profile 作用域的 Agent run：
// 建/复用会话 → 追加用户消息 → 起 run → 订阅 GET /turns/{id}/events 刷新轮次与会话历史。
// Agent 的文字回复渲染成对话气泡；待确认的主档改动复用 PendingActionCard，
// approve 之后才由后端写入主档（契约 §21.4），reject 不动主档。
// 交互契约交给 ui/modal 原语：焦点入内、Tab 锁定、Esc 关闭、焦点归还、背景 inert。

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import {
  appendSessionMessage,
  approvePendingAction,
  createSession,
  getModelConfig,
  listSessionMessages,
  listSessionTurns,
  listSessions,
  mapPendingAction,
  rejectPendingAction,
  startProfileRun,
} from "@/lib/api"
import { ApiRequestError } from "@/lib/api-client"
import { agentErrorKey } from "@/lib/agent-error"
import { useRuntimeStatus } from "@/lib/runtime"
import { AgentAvailabilityNotice, agentAvailability, agentAvailabilityActionEffect } from "@/components/agent-onboarding"
import { PendingActionCard } from "@/components/kit/pending-action"
import { RunErrorBlock } from "@/components/kit/run-error"
import { Modal } from "@/components/ui/modal"
import { subscribeTurnEvents } from "@/lib/turn-events"
import type { AgentSessionMessage } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Bot, Loader2, Send, User } from "lucide-react"

const SUGGESTIONS = [
  "profile.assistant.suggestion.phone",
  "profile.assistant.suggestion.city",
  "profile.assistant.suggestion.project",
  "profile.assistant.suggestion.skill",
]

interface Bubble {
  id: string
  role: "user" | "agent"
  text: string
}

interface OptimisticMessage {
  id: string
  text: string
}

/** 会话消息 content 是不透明 JSON：运行体写 Message wire，前端追加用户消息时写同一形态。 */
function sessionMessageText(content: unknown): string | null {
  if (typeof content === "string") return content.trim() || null
  if (content && typeof content === "object" && "content" in content) {
    const value = (content as { content?: unknown }).content
    if (typeof value === "string") return value.trim() || null
  }
  return null
}

/** 把查询失败归一成机器错误码：非 ApiRequestError（网络中断等）按 NETWORK_ERROR 处理。 */
function errorCodeOf(error: unknown): ApiRequestError["code"] {
  return error instanceof ApiRequestError ? error.code : "NETWORK_ERROR"
}

/**
 * 把会话历史投影成对话气泡：只取 user / assistant 且带文本的消息；
 * 运行体会把同一句用户消息镜像进会话，因此折叠相邻重复；已进入会话的乐观消息不再重复渲染。
 */
export function buildConversation(messages: AgentSessionMessage[], optimistic: OptimisticMessage[]): Bubble[] {
  const bubbles: Bubble[] = []
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue
    const text = sessionMessageText(message.content)
    if (!text) continue
    const role = message.role === "user" ? "user" : "agent"
    const last = bubbles[bubbles.length - 1]
    if (last && last.role === role && last.text === text) continue
    bubbles.push({ id: message.id, role, text })
  }
  const remaining = new Map<string, number>()
  for (const bubble of bubbles) {
    if (bubble.role === "user") remaining.set(bubble.text, (remaining.get(bubble.text) ?? 0) + 1)
  }
  for (const item of optimistic) {
    const left = remaining.get(item.text) ?? 0
    if (left > 0) {
      remaining.set(item.text, left - 1)
      continue
    }
    bubbles.push({ id: item.id, role: "user", text: item.text })
  }
  return bubbles
}

export function ProfileAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const modelQuery = useQuery({ queryKey: ["model-config"], queryFn: getModelConfig, enabled: open })
  const runtimeQuery = useRuntimeStatus(open)
  // 可用性六态：加载中 / 读取失败 / 无权限 / 未配置 / 运行体离线 / 可用。
  // 读取失败与无权限绝不能被当成「未配置」，否则会把用户误导向设置页。
  const availability = agentAvailability({
    model: {
      isPending: modelQuery.isPending,
      keyConfigured: modelQuery.data?.keyConfigured,
      errorCode: modelQuery.isError ? errorCodeOf(modelQuery.error) : undefined,
    },
    runtime: { isPending: runtimeQuery.isPending, available: runtimeQuery.data?.available },
  })
  const checkingAvailability = availability === "checking"
  const canChat = availability === "available"

  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentSessionMessage[]>([])
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([])
  const [input, setInput] = useState("")
  const [awaitingTurn, setAwaitingTurn] = useState(false)
  const [startErrorKey, setStartErrorKey] = useState<string | null>(null)
  // 失败后重试要能重放这次输入；会话历史里虽有镜像，但重试入口用最新一次发送更直接。
  const [lastPrompt, setLastPrompt] = useState("")
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null)
  const [submittingActionId, setSubmittingActionId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const optimisticSeq = useRef(0)
  const lastSeqRef = useRef(0)
  const lastTurnIdRef = useRef<string | null>(null)
  const sessionRef = useRef<string | null>(null)

  /**
   * 主档会话不是服务端概念：会话只绑 owner、可横跨简历与主档，scope 是轮次属性（契约 §21.1）。
   * 因此只采用「至少有一条 profile 轮次，且所有轮次都是 profile 作用域」的会话；
   * 没有这样的会话时返回 null，由提交路径新建，绝不退回「最近一条会话」。
   */
  const profileSessionQuery = useQuery({
    queryKey: ["profile-session"],
    enabled: open && canChat && !createdSessionId,
    queryFn: async () => {
      const candidates = await listSessions()
      for (const candidate of candidates) {
        const candidateTurns = await listSessionTurns(candidate.id)
        if (candidateTurns.length > 0 && candidateTurns.every((turn) => turn.scope === "profile")) {
          return candidate.id
        }
      }
      return null
    },
  })
  const sessionId = createdSessionId ?? profileSessionQuery.data ?? null
  sessionRef.current = sessionId

  const turnsQuery = useQuery({
    queryKey: ["session-turns", sessionId],
    queryFn: () => listSessionTurns(sessionId as string),
    enabled: Boolean(open && canChat && sessionId),
    refetchInterval: awaitingTurn ? 1500 : false,
  })
  // 采用的主档会话理论上只含 profile 轮次；仍过滤 resume 轮次，避免会话后来被简历 run 污染。
  const turns = useMemo(
    () => (turnsQuery.data ?? []).filter((turn) => turn.scope !== "resume"),
    [turnsQuery.data],
  )
  const activeTurn = turns.find((turn) => turn.state === "open") ?? turns[0]
  const activeTurnId = activeTurn?.id ?? null
  // 没有 open 轮次时会回退到最近一条已关闭轮次：该轮的历史 pending 待办必须按失效只读渲染，
  // 由 PendingActionCard 统一兜底（与工作台共享同一份实现），避免点击必得 409。
  const activeTurnClosed = activeTurn !== undefined && activeTurn.state !== "open"

  /** 拉取会话消息：after 之后的增量，按 id 去重，保证 StrictMode 重挂载不产生重复行。 */
  const loadMessages = useCallback(async (sid: string, after: number) => {
    const rows = (await listSessionMessages(sid, after)).filter((row) => row.sessionId === sid)
    if (sessionRef.current !== sid || !rows.length) return
    setMessages((prev) => {
      const seen = new Set(prev.map((row) => row.id))
      const merged = [...prev, ...rows.filter((row) => !seen.has(row.id))]
      merged.sort((a, b) => a.seq - b.seq)
      return merged
    })
    for (const row of rows) lastSeqRef.current = Math.max(lastSeqRef.current, row.seq)
  }, [])

  // 会话切换时重置本地历史并全量拉取；SSE / 轮次变化后只用 afterSeq 增量拉取。
  useEffect(() => {
    if (!open || !canChat || !sessionId) return
    setMessages([])
    lastSeqRef.current = 0
    void loadMessages(sessionId, 0)
  }, [open, canChat, sessionId, loadMessages])

  // StrictMode 安全：每次挂载新建订阅，cleanup 直接关闭 EventSource（不置标志丢弃结果）。
  // snapshot 是订阅首帧：后端可能在本端订阅前就写完了回复，必须和 turn.updated 一样补拉消息，
  // 否则「发完消息立刻重连 / 轮次已结束后才订阅」这类时序只能靠刷新才看得到回复。
  useEffect(() => {
    if (!open || !canChat || !activeTurnId) return
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["session-turns", sessionId] })
      if (sessionId) void loadMessages(sessionId, lastSeqRef.current)
    }
    return subscribeTurnEvents(activeTurnId, { onSnapshot: refresh, onUpdate: refresh })
  }, [open, canChat, activeTurnId, sessionId, queryClient, loadMessages])

  // 轮次集合变化（轮询发现新轮次 / SSE 刷新出新一轮）时补拉消息并结束等待：
  // 这是「发完消息不用刷新就能看到助手回复」的第二条路径，重复触发也只补拉增量。
  useEffect(() => {
    if (!open || !canChat || !sessionId) return
    const latestTurnId = turns[0]?.id ?? null
    if (latestTurnId === lastTurnIdRef.current) return
    lastTurnIdRef.current = latestTurnId
    if (!latestTurnId) return
    void loadMessages(sessionId, lastSeqRef.current)
    setAwaitingTurn(false)
  }, [open, canChat, sessionId, turns, loadMessages])

  // run 起后轮次由子进程创建：等不到新轮次时最多等 60s，避免无限转圈。
  useEffect(() => {
    if (!awaitingTurn) return
    const stop = window.setTimeout(() => setAwaitingTurn(false), 60000)
    return () => window.clearTimeout(stop)
  }, [awaitingTurn])

  const startMutation = useMutation({
    mutationFn: async (prompt: string) => {
      let sid = sessionId
      if (!sid) {
        sid = (await createSession()).id
        setCreatedSessionId(sid)
        sessionRef.current = sid
      }
      const history = await listSessionMessages(sid)
      const nextSeq = history.reduce((max, row) => Math.max(max, row.seq), 0) + 1
      await appendSessionMessage(sid, { seq: nextSeq, role: "user", content: { role: "user", content: prompt } })
      await startProfileRun(sid, prompt)
      return sid
    },
    onMutate: () => setStartErrorKey(null),
    onSuccess: (sid) => {
      setAwaitingTurn(true)
      void queryClient.invalidateQueries({ queryKey: ["session-turns", sid] })
      void queryClient.invalidateQueries({ queryKey: ["profile-session"] })
    },
    onError: (cause) => setStartErrorKey(agentErrorKey(cause)),
  })

  const decision = useMutation({
    mutationFn: ({ actionId, kind }: { actionId: string; kind: "approve" | "reject" }) =>
      kind === "approve" ? approvePendingAction(actionId) : rejectPendingAction(actionId),
    onMutate: ({ actionId }) => {
      setActionErrorKey(null)
      setSubmittingActionId(actionId)
    },
    // 审批写入主档后，页面上的 ["profile"] 查询必须重新取数。
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["session-turns", sessionId] })
      void queryClient.invalidateQueries({ queryKey: ["profile"] })
    },
    onError: (cause) => setActionErrorKey(agentErrorKey(cause)),
    onSettled: () => setSubmittingActionId(null),
  })

  const conversation = useMemo(() => buildConversation(messages, optimistic), [messages, optimistic])
  const pendingActions = useMemo(
    () => (activeTurn?.pendingActions ?? []).map(mapPendingAction),
    [activeTurn],
  )

  useEffect(() => {
    const node = scrollRef.current
    // jsdom 没有实现元素的 scrollTo；浏览器里才需要自动滚到底部。
    if (node && typeof node.scrollTo === "function") {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" })
    }
  }, [conversation.length, pendingActions.length, awaitingTurn, startMutation.isPending])

  if (!open) return null

  function submit(text: string) {
    const value = text.trim()
    if (!value || startMutation.isPending) return
    setInput("")
    setLastPrompt(value)
    optimisticSeq.current += 1
    setOptimistic((prev) => [...prev, { id: `optimistic_${optimisticSeq.current}`, text: value }])
    startMutation.mutate(value)
  }

  const thinking = startMutation.isPending || awaitingTurn

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={t("profile.assistant.title")}
      description={t("profile.assistant.description")}
      placement="right"
      closeLabel={t("profile.assistant.close")}
    >
      {checkingAvailability ? (
        // 加载中不再渲染空白正文：用骨架占位，读屏用 status 播报。
        <div role="status" aria-label={t("common.pageState.loading")} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <SkeletonBubble className="w-2/3" />
          <SkeletonBubble className="w-1/2" />
          <SkeletonBubble className="w-3/4" />
        </div>
      ) : availability !== "available" ? (
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <AgentAvailabilityNotice
            state={availability}
            placement="panel"
            onAction={(action) => {
              // 与设置页同一套 AgentAvailabilityAction 语义：只有 configure_model 去设置页；
              // start_chat 表示「进入对话」，本抽屉本身就是对话入口，聚焦自己的输入框即可；
              // retry 重试可用性查询；未知动作留在当前页，绝不误触发导航。
              switch (agentAvailabilityActionEffect(action)) {
                case "settings":
                  navigate("/settings")
                  return
                case "retry":
                  void modelQuery.refetch()
                  void runtimeQuery.refetch()
                  return
                case "chat":
                  composerRef.current?.focus()
                  return
                default:
                  return
              }
            }}
          />
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {conversation.length === 0 && !thinking ? (
              <div className="space-y-4">
                <div className="flex gap-2.5">
                  <AgentAvatar />
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-6 text-foreground break-words">
                    {t("profile.assistant.intro")}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="px-1 text-xs font-medium text-muted-foreground">{t("profile.assistant.trySaying")}</p>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(t(s))}
                      className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-cobalt/40 hover:bg-secondary"
                    >
                      {t(s)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              conversation.map((bubble) =>
                bubble.role === "user" ? (
                  <div key={bubble.id} className="flex justify-end gap-2.5">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-cobalt px-3.5 py-2.5 text-sm leading-6 text-primary-foreground break-words">{bubble.text}</div>
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cobalt/15 text-cobalt">
                      <User className="size-4" aria-hidden />
                    </span>
                  </div>
                ) : (
                  <div key={bubble.id} className="flex gap-2.5">
                    <AgentAvatar />
                    <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-6 text-foreground break-words">{bubble.text}</div>
                  </div>
                ),
              )
            )}

            {pendingActions.map((action) => (
              <PendingActionCard
                key={action.id}
                action={action}
                turnClosed={activeTurnClosed}
                onApprove={(id) => decision.mutate({ actionId: id, kind: "approve" })}
                onReject={(id) => decision.mutate({ actionId: id, kind: "reject" })}
                busy={submittingActionId === action.id}
              />
            ))}

            {/* 运行失败必须可见（issue 4ff97）：与简历工作台共用同一份错误块实现。 */}
            {activeTurn?.runError ? (
              <RunErrorBlock
                error={activeTurn.runError}
                onRetry={lastPrompt ? () => submit(lastPrompt) : undefined}
              />
            ) : null}

            {thinking ? (
              <div className="flex gap-2.5">
                <AgentAvatar />
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> {t("profile.assistant.thinking")}
                </div>
              </div>
            ) : null}
          </div>

          {startErrorKey || actionErrorKey ? (
            <p role="alert" className="mx-3 mb-1 rounded-md bg-coral/10 px-2.5 py-1.5 text-xs font-medium text-coral">
              {t(startErrorKey ?? actionErrorKey!)}
            </p>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit(input)
            }}
            className="border-t border-border p-3"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={composerRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault()
                    submit(input)
                  }
                }}
                rows={2}
                placeholder={t("profile.assistant.placeholder")}
                className="min-h-[44px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
              <button
                type="submit"
                disabled={!input.trim() || startMutation.isPending}
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                aria-label={t("profile.assistant.send")}
              >
                <Send className="size-4" aria-hidden />
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  )
}

function AgentAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cobalt/15 text-cobalt">
      <Bot className="size-4" aria-hidden />
    </span>
  )
}

/** 加载占位：只在可用性查询未落定时出现，避免抽屉正文长时间空白。 */
function SkeletonBubble({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-10 max-w-[80%] animate-pulse rounded-2xl bg-secondary", className)} />
}
