// SCR-003 对话区外壳：当前 Run（RunPanel）与「历史会话」浏览共用中间栏。
// 历史会话复用既有的 SessionList / SessionDetail（含空/加载/错误/compacted 状态）。
// 继续对话必须写回同一会话：先 POST /sessions/{id}/messages（seq = 现有最大 seq + 1），
// 再以同一个 sessionId 起 resume run（POST /resumes/{id}/runs 带 sessionId），不新建会话。
// 会话只绑 owner、scope 是轮次属性（契约 §19.1 / §21.1）；主档助手会话选取见 11ad1，与本组件解耦。
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Send } from "lucide-react"
import { appendSessionMessage, listSessionMessages, listSessions, startRun } from "@/lib/api"
import { agentErrorKey } from "@/lib/agent-error"
import { RunPanel } from "@/components/run-panel"
import { SessionDetail, SessionList, type SessionMessage } from "@/components/session-history"
import type { AgentRun, AgentSessionMessage, ExecutionMode } from "@/lib/types"
import { cn } from "@/lib/utils"

type ChatView = "run" | "history"

/** 展示组件只读 id/seq/role/content；sessionId/createdAt 是列表与排序用的，不参与渲染。 */
function toSessionMessages(rows: AgentSessionMessage[]): SessionMessage[] {
  return rows.map((row) => ({ id: row.id, seq: row.seq, role: row.role, content: row.content }))
}

export function ResumeChatPanel({
  resumeId,
  run,
  mode,
  initialView = "run",
  initialSessionId = null,
}: {
  resumeId: string
  run?: AgentRun | null
  mode: ExecutionMode
  /** 初始视图；Storybook 需要直接把历史会话态跑起来，默认落在当前对话。 */
  initialView?: ChatView
  /** 初始选中的会话；仅用于 Storybook / 深链预览。 */
  initialSessionId?: string | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [view, setView] = useState<ChatView>(initialView)
  const [selectedId, setSelectedId] = useState<string | null>(initialSessionId)
  const [input, setInput] = useState("")
  const [sendError, setSendError] = useState<string | null>(null)
  const [awaitingReply, setAwaitingReply] = useState(false)
  // 继续发送的用户消息 seq：只有比它更大且来自助手的消息才算「回复已到」。
  const awaitingFromSeq = useRef(0)

  // 当前 active run 所属会话；作为列表里的「当前会话」高亮依据。
  const activeSessionId = run?.conversationId

  const sessionsQuery = useQuery({
    queryKey: ["sessions"],
    queryFn: listSessions,
    enabled: view === "history",
  })
  const detailQuery = useQuery({
    queryKey: ["session-messages", selectedId],
    queryFn: () => listSessionMessages(selectedId as string),
    enabled: view === "history" && Boolean(selectedId),
    refetchInterval: awaitingReply ? 1500 : false,
  })

  // 助手回复到达（seq 更大且 role=assistant）即停止轮询；等不到时由 60s 超时兜底。
  useEffect(() => {
    if (!awaitingReply) return
    const rows = detailQuery.data ?? []
    if (rows.some((row) => row.seq > awaitingFromSeq.current && row.role === "assistant")) {
      setAwaitingReply(false)
    }
  }, [awaitingReply, detailQuery.data])
  useEffect(() => {
    if (!awaitingReply) return
    const stop = window.setTimeout(() => setAwaitingReply(false), 60000)
    return () => window.clearTimeout(stop)
  }, [awaitingReply])

  const send = useMutation({
    mutationFn: async (prompt: string) => {
      const sid = selectedId
      if (!sid) throw new Error("no session selected")
      // 重新读一次最大 seq：列表可能已经被运行体推进，不能依赖本地缓存。
      const history = await listSessionMessages(sid)
      const nextSeq = history.reduce((max, row) => Math.max(max, row.seq), 0) + 1
      await appendSessionMessage(sid, { seq: nextSeq, role: "user", content: { role: "user", content: prompt } })
      awaitingFromSeq.current = nextSeq
      await startRun(resumeId, { prompt, executionMode: mode, sessionId: sid })
      return sid
    },
    onMutate: () => setSendError(null),
    onSuccess: (sid) => {
      setInput("")
      setAwaitingReply(true)
      void queryClient.invalidateQueries({ queryKey: ["session-messages", sid] })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["active-run", resumeId] })
    },
    onError: (cause) => setSendError(t(agentErrorKey(cause))),
  })

  function submit() {
    const prompt = input.trim()
    if (!prompt || send.isPending) return
    send.mutate(prompt)
  }

  const sessions = sessionsQuery.data
  const selected = sessions?.find((session) => session.id === selectedId)

  const tabClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
    )

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" aria-label={t("sessionHistory.title")} className="flex gap-1 border-b border-border p-1.5">
        <button type="button" role="tab" aria-selected={view === "run"} onClick={() => setView("run")} className={tabClass(view === "run")}>
          {t("sessionHistory.currentChat")}
        </button>
        <button type="button" role="tab" aria-selected={view === "history"} onClick={() => setView("history")} className={tabClass(view === "history")}>
          {t("sessionHistory.title")}
        </button>
      </div>

      {view === "run" ? (
        <div role="tabpanel" className="min-h-0 flex-1">
          <RunPanel resumeId={resumeId} run={run} mode={mode} />
        </div>
      ) : (
        <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {selectedId ? (
              <SessionDetail
                session={selected}
                messages={detailQuery.data ? toSessionMessages(detailQuery.data) : undefined}
                error={detailQuery.isError ? t("sessionHistory.detail.errorDescription") : undefined}
                onBack={() => {
                  setSelectedId(null)
                  setSendError(null)
                }}
              />
            ) : (
              <SessionList
                sessions={sessions}
                error={sessionsQuery.isError ? t("sessionHistory.list.errorDescription") : undefined}
                activeId={activeSessionId}
                onSelect={setSelectedId}
              />
            )}
          </div>

          {selectedId ? (
            <div className="border-t border-border p-3">
              <p className="mb-2 text-xs text-muted-foreground">{t("sessionHistory.continue.hint")}</p>
              {sendError ? (
                <p role="alert" className="mb-2 rounded-md bg-coral/10 px-2.5 py-1.5 text-xs font-medium text-coral">
                  {sendError}
                </p>
              ) : null}
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                      submit()
                    }
                  }}
                  rows={2}
                  aria-label={t("sessionHistory.continue.placeholder")}
                  placeholder={t("sessionHistory.continue.placeholder")}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                />
                <button
                  type="button"
                  onClick={submit}
                  disabled={send.isPending || !input.trim()}
                  aria-busy={send.isPending}
                  aria-label={t("sessionHistory.continue.send")}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
