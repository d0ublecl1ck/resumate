// 个人资料助手：主档的对话入口。真实接线到 profile 作用域的 Agent run：
// 建/复用会话 → 追加用户消息 → 起 run → 订阅 GET /turns/{id}/events 刷新轮次与会话历史。
// Agent 的文字回复渲染成对话气泡；待确认的主档改动复用 PendingActionCard，
// approve 之后才由后端写入主档（契约 §21.4），reject 不动主档。

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
import { agentErrorKey } from "@/lib/agent-error"
import { useRuntimeStatus } from "@/lib/runtime"
import { AgentAvailabilityNotice, agentAvailabilityFromModelConfig } from "@/components/agent-onboarding"
import { PendingActionCard } from "@/components/kit/pending-action"
import { subscribeTurnEvents } from "@/lib/turn-events"
import type { AgentSessionMessage } from "@/lib/types"
import { Bot, Loader2, Send, Sparkles, User, X } from "lucide-react"

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
  const availability = agentAvailabilityFromModelConfig(
    modelQuery.data ?? { keyConfigured: false },
    runtimeQuery.data,
  )
  const checkingAvailability = open && (modelQuery.isPending || runtimeQuery.isPending)
  const canChat = availability === "available"

  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentSessionMessage[]>([])
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([])
  const [input, setInput] = useState("")
  const [awaitingTurn, setAwaitingTurn] = useState(false)
  const [startErrorKey, setStartErrorKey] = useState<string | null>(null)
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null)
  const [submittingActionId, setSubmittingActionId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const optimisticSeq = useRef(0)
  const lastSeqRef = useRef(0)
  const turnCountRef = useRef(0)
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

  // 会话切换时重置本地历史并全量拉取；SSE 更新后只用 afterSeq 增量拉取。
  useEffect(() => {
    if (!open || !canChat || !sessionId) return
    setMessages([])
    lastSeqRef.current = 0
    void loadMessages(sessionId, 0)
  }, [open, canChat, sessionId, loadMessages])

  // StrictMode 安全：每次挂载新建订阅，cleanup 直接关闭 EventSource（不置标志丢弃结果）。
  useEffect(() => {
    if (!open || !canChat || !activeTurnId) return
    return subscribeTurnEvents(activeTurnId, {
      onUpdate: () => {
        void queryClient.invalidateQueries({ queryKey: ["session-turns", sessionId] })
        if (sessionId) void loadMessages(sessionId, lastSeqRef.current)
      },
    })
  }, [open, canChat, activeTurnId, sessionId, queryClient, loadMessages])

  // run 起后轮次由子进程创建：轮询发现新轮次，最多 60s。
  useEffect(() => {
    if (!awaitingTurn) return
    if (turns.length > turnCountRef.current) {
      setAwaitingTurn(false)
      return
    }
    const stop = window.setTimeout(() => setAwaitingTurn(false), 60000)
    return () => window.clearTimeout(stop)
  }, [awaitingTurn, turns.length])

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
      turnCountRef.current = turns.length
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
    optimisticSeq.current += 1
    setOptimistic((prev) => [...prev, { id: `optimistic_${optimisticSeq.current}`, text: value }])
    startMutation.mutate(value)
  }

  const thinking = startMutation.isPending || awaitingTurn

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t("profile.assistant.aria")}>
      <button className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]" aria-label={t("common.actions.close")} onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-foreground/15 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-cobalt/15 text-cobalt">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("profile.assistant.title")}</p>
              <p className="text-xs text-muted-foreground">{t("profile.assistant.description")}</p>
            </div>
          </div>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" aria-label={t("common.actions.close")}>
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {checkingAvailability ? null : availability !== "available" ? (
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <AgentAvailabilityNotice state={availability} placement="panel" onAction={() => navigate("/settings")} />
          </div>
        ) : (
          <>
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
              {conversation.length === 0 && !thinking ? (
                <div className="space-y-4">
                  <div className="flex gap-2.5">
                    <AgentAvatar />
                    <div className="rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-6 text-foreground">
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
                      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-cobalt px-3.5 py-2.5 text-sm leading-6 text-primary-foreground">{bubble.text}</div>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cobalt/15 text-cobalt">
                        <User className="size-4" aria-hidden />
                      </span>
                    </div>
                  ) : (
                    <div key={bubble.id} className="flex gap-2.5">
                      <AgentAvatar />
                      <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-6 text-foreground">{bubble.text}</div>
                    </div>
                  ),
                )
              )}

              {pendingActions.map((action) => (
                <PendingActionCard
                  key={action.id}
                  action={action}
                  onApprove={(id) => decision.mutate({ actionId: id, kind: "approve" })}
                  onReject={(id) => decision.mutate({ actionId: id, kind: "reject" })}
                  busy={submittingActionId === action.id}
                />
              ))}

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
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
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
      </div>
    </div>
  )
}

function AgentAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cobalt/15 text-cobalt">
      <Bot className="size-4" aria-hidden />
    </span>
  )
}
