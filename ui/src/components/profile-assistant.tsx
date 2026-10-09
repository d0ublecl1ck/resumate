// 个人资料助手：主档的对话入口。真实接线到 profile 作用域的 Agent run：
// 抽屉正文是 profile-assistant-panel 展示层，本文件只负责数据与会话作用域：
// 当前对话 = 复用/新建的主档会话；历史会话 = GET /sessions 列表 + 详情，
// 在历史会话里继续对话只写回被选中的那个 session（契约 §19 / §21）。
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
import {
  AgentAvailabilityNotice,
  agentAvailability,
  agentAvailabilityActionEffect,
  maskedCredentialTail,
} from "@/components/agent-onboarding"
import { ProfileAssistantPanel, type ProfileAssistantView } from "@/components/profile-assistant-panel"
import { Modal } from "@/components/ui/modal"
import { subscribeTurnEvents } from "@/lib/turn-events"
import { sessionMessageText } from "@/lib/run-conversation"
import type { AgentSessionMessage } from "@/lib/types"
import type { SessionSummary } from "@/components/session-history"
import { cn } from "@/lib/utils"

interface Bubble {
  id: string
  role: "user" | "agent"
  text: string
}

interface OptimisticMessage {
  id: string
  text: string
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
  // 可用性七态：加载中 / 读取失败 / 无权限 / 未配置 / 凭据被拒 / 运行体离线 / 可用。
  // 读取失败与无权限绝不能被当成「未配置」，否则会把用户误导向设置页；
  // lastTest 是「配置读得到但凭据被上游拒绝」的唯一信号，不传就判不出 auth_failed。
  const availability = agentAvailability({
    model: {
      isPending: modelQuery.isPending,
      keyConfigured: modelQuery.data?.keyConfigured,
      errorCode: modelQuery.isError ? errorCodeOf(modelQuery.error) : undefined,
      lastTest: modelQuery.data?.lastTest,
    },
    runtime: { isPending: runtimeQuery.isPending, available: runtimeQuery.data?.available },
  })
  const checkingAvailability = availability === "checking"
  const canChat = availability === "available"
  // 只把上游已掩码的尾号交给界面：maskedCredentialTail 只认 ****be21 形态，
  // 拿不到掩码（含误传明文 key）一律返回 null，绝不自行拼接或透出 lastTest 原文。
  const credentialHint = maskedCredentialTail(modelQuery.data?.lastTest?.message)

  const [mode, setMode] = useState<ProfileAssistantView>("current")
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null)
  const [historySessionId, setHistorySessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<AgentSessionMessage[]>([])
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([])
  const [awaitingTurn, setAwaitingTurn] = useState(false)
  const [startErrorKey, setStartErrorKey] = useState<string | null>(null)
  // 失败后重试要能重放这次输入；会话历史里虽有镜像，但重试入口用最新一次发送更直接。
  const [lastPrompt, setLastPrompt] = useState("")
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null)
  const [submittingActionId, setSubmittingActionId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const optimisticSeq = useRef(0)
  const lastSeqRef = useRef(0)
  const lastTurnIdRef = useRef<string | null>(null)
  const sessionRef = useRef<string | null>(null)

  /**
   * 主档会话不是服务端概念：会话只绑 owner、可横跨简历与主档，scope 是轮次属性（契约 §21.1）。
   * 因此只采用「至少有一条 profile 轮次，且所有轮次都是 profile 作用域」的会话；
   * 没有这样的会话时返回 null，由提交路径新建，绝不退回「最近一条会话」。
   */
  const findProfileSession = useCallback(async (): Promise<string | null> => {
    const candidates = await listSessions()
    for (const candidate of candidates) {
      const candidateTurns = await listSessionTurns(candidate.id)
      if (candidateTurns.length > 0 && candidateTurns.every((turn) => turn.scope === "profile")) {
        return candidate.id
      }
    }
    return null
  }, [])
  const profileSessionQuery = useQuery({
    queryKey: ["profile-session"],
    enabled: open && canChat && !createdSessionId,
    queryFn: findProfileSession,
  })
  const sessionId = createdSessionId ?? profileSessionQuery.data ?? null
  sessionRef.current = sessionId

  /**
   * 历史会话列表：GET /sessions 现在返回服务端派生的 title 与 messageCount（契约 §19.1，
   * issue 360b1），直接消费后端字段，不再逐会话拉消息；title 为 null 时由展示层兜底「未命名对话」。
   */
  const sessionsQuery = useQuery({
    queryKey: ["profile-assistant-sessions"],
    enabled: open && canChat,
    queryFn: async (): Promise<SessionSummary[]> => {
      const rows = await listSessions()
      return rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        lastActiveAt: row.lastActiveAt,
        title: row.title ?? undefined,
        messageCount: row.messageCount ?? undefined,
      }))
    },
  })

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

  /** 历史详情消息：只有进入历史视图并选中某一行时才拉取，选中哪个就只拉哪个。 */
  const historyMessagesQuery = useQuery({
    queryKey: ["profile-assistant-history-messages", historySessionId],
    queryFn: () => listSessionMessages(historySessionId as string),
    enabled: Boolean(open && canChat && mode === "history" && historySessionId),
  })

  /** 拉取当前会话消息：after 之后的增量，按 id 去重，保证 StrictMode 重挂载不产生重复行。 */
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

  const createMutation = useMutation({
    mutationFn: createSession,
    onSuccess: (session) => {
      setCreatedSessionId(session.id)
      sessionRef.current = session.id
      setMessages([])
      lastSeqRef.current = 0
      setOptimistic([])
      setMode("current")
      setHistorySessionId(null)
      void queryClient.invalidateQueries({ queryKey: ["profile-assistant-sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["profile-session"] })
    },
    onError: (cause) => setStartErrorKey(agentErrorKey(cause)),
  })

  const sendMutation = useMutation({
    mutationFn: async ({ target, text }: { target: string | null; text: string }) => {
      // 目标会话优先用调用方传入的历史/当前会话；当前视图首次发送时先复用已发现（含在途）的
      // 主档会话，确实没有才新建——否则「可用性刚就绪、会话发现还没回来」会误建一条新会话。
      let sid =
        target ??
        (await queryClient.ensureQueryData({ queryKey: ["profile-session"], queryFn: findProfileSession }))
      if (!sid) {
        sid = (await createSession()).id
        setCreatedSessionId(sid)
        sessionRef.current = sid
      }
      const history = await listSessionMessages(sid)
      const nextSeq = history.reduce((max, row) => Math.max(max, row.seq), 0) + 1
      await appendSessionMessage(sid, { seq: nextSeq, role: "user", content: { role: "user", content: text } })
      await startProfileRun(sid, text)
      return sid
    },
    onMutate: () => setStartErrorKey(null),
    onSuccess: (sid) => {
      setAwaitingTurn(true)
      void queryClient.invalidateQueries({ queryKey: ["session-turns", sid] })
      void queryClient.invalidateQueries({ queryKey: ["profile-session"] })
      void queryClient.invalidateQueries({ queryKey: ["profile-assistant-sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["profile-assistant-history-messages", sid] })
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
  const thinking = sendMutation.isPending || awaitingTurn
  const runErrorKey = startErrorKey ?? actionErrorKey
  // 每个视图只透出自己那一路错误，避免历史列表报错却显示当前对话的错误。
  // 列表 / 详情读取失败只给统一的界面文案，绝不回显服务端原文。
  const loadError = t("profile.assistant.panel.loadError")
  const panelError =
    mode === "current"
      ? runErrorKey
        ? t(runErrorKey)
        : undefined
      : historySessionId
        ? historyMessagesQuery.isError
          ? loadError
          : undefined
        : sessionsQuery.isError
          ? loadError
          : undefined

  /**
   * 继续对话：当前视图写回主档会话，历史视图只写回被选中的那个 session。
   * 没有会话时（当前视图首次发送）才新建，绝不把历史会话的消息写回最新会话。
   */
  function handleContinue(text: string) {
    const value = text.trim()
    if (!value || sendMutation.isPending || createMutation.isPending) return
    const target = mode === "history" ? historySessionId : sessionId
    if (mode === "current") {
      setLastPrompt(value)
      optimisticSeq.current += 1
      setOptimistic((prev) => [...prev, { id: `optimistic_${optimisticSeq.current}`, text: value }])
    }
    sendMutation.mutate({ target, text: value })
  }

  function handleCreate() {
    if (createMutation.isPending) return
    createMutation.mutate()
  }

  useEffect(() => {
    const node = scrollRef.current
    // jsdom 没有实现元素的 scrollTo；浏览器里才需要自动滚到底部。
    if (node && typeof node.scrollTo === "function") {
      node.scrollTo({ top: node.scrollHeight, behavior: "smooth" })
    }
  }, [conversation.length, pendingActions.length, awaitingTurn, sendMutation.isPending])

  if (!open) return null

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
            credentialHint={credentialHint}
            onAction={(action) => {
              // 与设置页同一套 AgentAvailabilityAction 语义：只有 configure_model 去设置页；
              // start_chat 表示「进入对话」，本抽屉本身就是对话入口；retry 重试可用性查询；
              // 未知动作留在当前页，绝不误触发导航。
              switch (agentAvailabilityActionEffect(action)) {
                case "settings":
                  navigate("/settings")
                  return
                case "retry":
                  void modelQuery.refetch()
                  void runtimeQuery.refetch()
                  return
                default:
                  return
              }
            }}
          />
        </div>
      ) : (
        <ProfileAssistantPanel
          mode={mode}
          sessions={sessionsQuery.data}
          messages={historyMessagesQuery.data}
          activeSessionId={historySessionId}
          currentRun={{
            bubbles: conversation,
            pendingActions,
            turnClosed: activeTurnClosed,
            thinking,
            runError: activeTurn?.runError ?? null,
            onRetry: lastPrompt ? () => handleContinue(lastPrompt) : undefined,
            onApprove: (id) => decision.mutate({ actionId: id, kind: "approve" }),
            onReject: (id) => decision.mutate({ actionId: id, kind: "reject" }),
            busyActionId: submittingActionId,
          }}
          error={panelError}
          creating={createMutation.isPending}
          onCreate={handleCreate}
          onSelect={setHistorySessionId}
          onBack={() => setHistorySessionId(null)}
          onContinue={handleContinue}
          onModeChange={setMode}
          bodyRef={scrollRef}
        />
      )}
    </Modal>
  )
}

/** 加载占位：只在可用性查询未落定时出现，避免抽屉正文长时间空白。 */
function SkeletonBubble({ className }: { className?: string }) {
  return <div aria-hidden className={cn("h-10 max-w-[80%] animate-pulse rounded-2xl bg-secondary", className)} />
}
