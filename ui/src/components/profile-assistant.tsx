// 个人资料助手：一个对话抽屉，用自然语言维护主档资料。
// 既能新增/更新经历、项目、技能等条目（C-07：建议 → 显式确认后入库，默认待核实），
// 也能修改基本信息（姓名/头衔/邮箱/电话/城市）。

import { useEffect, useRef, useState } from "react"
import type {
  FactType,
  ProfileFact,
  ProposedBasicsChange,
  ProposedFactChange,
  ResumeBasics,
} from "@/lib/types"
import { parseProfileInput, createFact, updateFact, updateBasics } from "@/lib/api"
import { FACT_TYPE_LABEL, FACT_TYPE_ORDER } from "@/lib/profile"
import { EvidenceBadge } from "@/components/kit/badges"
import { cn } from "@/lib/utils"
import { Bot, CircleCheck, Loader2, Send, Sparkles, User, X } from "lucide-react"

type Message =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "agent"; text: string }
  | { id: string; kind: "fact"; change: ProposedFactChange; resolved?: "created" | "updated" | "discarded" }
  | { id: string; kind: "basics"; change: ProposedBasicsChange; resolved?: "updated" | "discarded" }

const SUGGESTIONS = [
  "把我的电话改成 139 1234 5678",
  "我现在在北京工作",
  "2024 年主导重构订单系统，首屏从 4s 优化到 1.2s",
  "我精通 TypeScript 和 React，最近在深入 Rust",
]

export function ProfileAssistant({
  open,
  onClose,
  onCommitFact,
  onCommitBasics,
  prefill,
  defaultType,
}: {
  open: boolean
  onClose: () => void
  onCommitFact: (fact: ProfileFact, operation: "create" | "update") => void
  onCommitBasics: (basics: ResumeBasics) => void
  prefill?: { hint: string } | null
  defaultType?: FactType
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageSeq = useRef(0)

  useEffect(() => {
    // 打开弹窗时用 prefill 覆盖输入框；改成渲染期同步会改变「关闭后用同一 prefill 重开是否清空输入」的既有语义。
    // oxlint-disable-next-line react/set-state-in-effect -- 保留 effect 的同步语义
    if (open && prefill?.hint) setInput(prefill.hint)
  }, [open, prefill])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, thinking])

  if (!open) return null

  async function submit(text: string) {
    const value = text.trim()
    if (!value || thinking) return
    messageSeq.current += 1
    const uid = `m_${messageSeq.current}`
    setMessages((prev) => [...prev, { id: uid, kind: "user", text: value }])
    setInput("")
    setThinking(true)
    const result = await parseProfileInput(value)
    setThinking(false)

    if (result.kind === "basics") {
      setMessages((prev) => [
        ...prev,
        { id: `${uid}_a`, kind: "agent", text: "我理解为修改基本信息。请核对下面的变更后确认。" },
        { id: `${uid}_p`, kind: "basics", change: result.change },
      ])
      return
    }

    // fact：若来自某个分区的「添加」，用 defaultType 修正新建类型
    const change =
      defaultType && result.change.operation === "create"
        ? { ...result.change, type: defaultType }
        : result.change
    setMessages((prev) => [
      ...prev,
      {
        id: `${uid}_a`,
        kind: "agent",
        text:
          change.operation === "update"
            ? `我理解为对已有条目「${change.targetFactTitle}」的补充。请核对后确认。`
            : "我整理成了一条新条目。请核对内容后确认加入你的资料。",
      },
      { id: `${uid}_p`, kind: "fact", change },
    ])
  }

  async function resolveFact(msgId: string, change: ProposedFactChange, edited: EditableFact, verified: boolean) {
    const finalChange: ProposedFactChange = {
      ...change,
      type: edited.type,
      title: edited.title,
      content: edited.content,
      evidenceStatus: verified ? "verified" : "unverified",
    }
    const fact =
      finalChange.operation === "update" && finalChange.targetFactId
        ? await updateFact(finalChange.targetFactId, {
            title: finalChange.title,
            content: finalChange.content,
            evidence: { status: finalChange.evidenceStatus },
          })
        : await createFact(finalChange)

    onCommitFact(fact, finalChange.operation)
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && m.kind === "fact" ? { ...m, resolved: finalChange.operation === "update" ? "updated" : "created" } : m)),
    )
    setMessages((prev) => [
      ...prev,
      {
        id: `${msgId}_ok`,
        kind: "agent",
        text: `${finalChange.operation === "update" ? "已更新" : "已加入"}「${finalChange.title}」。${verified ? "已标记为已核实。" : "当前为待核实，记得补充证据。"}`,
      },
    ])
  }

  async function resolveBasics(msgId: string, change: ProposedBasicsChange, edited: Record<string, string>) {
    const patch: Partial<ResumeBasics> = {}
    for (const f of change.fields) {
      patch[f.key] = edited[f.key] ?? f.after
    }
    const basics = await updateBasics(patch)
    onCommitBasics(basics)
    setMessages((prev) => prev.map((m) => (m.id === msgId && m.kind === "basics" ? { ...m, resolved: "updated" } : m)))
    setMessages((prev) => [
      ...prev,
      { id: `${msgId}_ok`, kind: "agent", text: `已更新基本信息：${change.fields.map((f) => f.label).join("、")}。` },
    ])
  }

  function discard(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && (m.kind === "fact" || m.kind === "basics") ? { ...m, resolved: "discarded" } : m)),
    )
    setMessages((prev) => [...prev, { id: `${msgId}_x`, kind: "agent", text: "好的，已忽略这条建议。你可以换个说法再试。" }])
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="个人资料助手">
      <button className="absolute inset-0 bg-foreground/30 backdrop-blur-[1px]" aria-label="关闭" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-foreground/15 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-cobalt/15 text-cobalt">
              <Sparkles className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">个人资料助手</p>
              <p className="text-xs text-muted-foreground">自然语言维护基本信息与经历，AI 整理后你确认</p>
            </div>
          </div>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary" aria-label="关闭">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="flex gap-2.5">
                <AgentAvatar />
                <div className="rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-6 text-foreground">
                  你可以让我改基本信息（比如「把城市改成北京」），也可以补充经历、项目、技能。我会整理成条目，等你确认后再写入。
                </div>
              </div>
              <div className="space-y-2">
                <p className="px-1 text-xs font-medium text-muted-foreground">试试这样说：</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => submit(s)}
                    className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-cobalt/40 hover:bg-secondary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) =>
              m.kind === "user" ? (
                <div key={m.id} className="flex justify-end gap-2.5">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-cobalt px-3.5 py-2.5 text-sm leading-6 text-primary-foreground">{m.text}</div>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-cobalt/15 text-cobalt">
                    <User className="size-4" aria-hidden />
                  </span>
                </div>
              ) : m.kind === "agent" ? (
                <div key={m.id} className="flex gap-2.5">
                  <AgentAvatar />
                  <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm leading-6 text-foreground">{m.text}</div>
                </div>
              ) : m.kind === "fact" ? (
                <FactCard key={m.id} message={m} onConfirm={resolveFact} onDiscard={discard} />
              ) : (
                <BasicsCard key={m.id} message={m} onConfirm={resolveBasics} onDiscard={discard} />
              ),
            )
          )}
          {thinking ? (
            <div className="flex gap-2.5">
              <AgentAvatar />
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> 正在整理…
              </div>
            </div>
          ) : null}
        </div>

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
              placeholder="改基本信息，或补充一段经历…（Enter 发送，Shift+Enter 换行）"
              className="min-h-[44px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              aria-label="发送"
            >
              <Send className="size-4" aria-hidden />
            </button>
          </div>
        </form>
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

interface EditableFact {
  type: FactType
  title: string
  content: string
}

function FactCard({
  message,
  onConfirm,
  onDiscard,
}: {
  message: Extract<Message, { kind: "fact" }>
  onConfirm: (msgId: string, change: ProposedFactChange, edited: EditableFact, verified: boolean) => Promise<void>
  onDiscard: (msgId: string) => void
}) {
  const { change, resolved } = message
  const [type, setType] = useState<FactType>(change.type)
  const [title, setTitle] = useState(change.title)
  const [content, setContent] = useState(change.content)
  const [verified, setVerified] = useState(false)
  const [busy, setBusy] = useState(false)
  const isUpdate = change.operation === "update"

  if (resolved) {
    return (
      <div className="ml-9 flex items-center gap-2 rounded-lg border border-cobalt/30 bg-cobalt/5 px-3 py-2 text-xs text-foreground">
        <CircleCheck className="size-4 text-cobalt" aria-hidden />
        {resolved === "discarded" ? "已忽略该建议" : resolved === "updated" ? `已更新「${title}」` : `已加入「${title}」`}
      </div>
    )
  }

  return (
    <div className="ml-9 rounded-xl border-[1.5px] border-foreground/15 bg-background p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold", isUpdate ? "bg-gold/20 text-foreground" : "bg-cobalt/10 text-cobalt")}>
          {isUpdate ? "更新已有条目" : "新增条目"}
        </span>
        <span className="text-[11px] text-muted-foreground">解析置信度 {Math.round(change.parseConfidence * 100)}%</span>
      </div>

      <div className="space-y-2.5">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">类型</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FactType)}
            disabled={isUpdate}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
          >
            {FACT_TYPE_ORDER.map((k) => (
              <option key={k} value={k}>{FACT_TYPE_LABEL[k]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">标题</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{isUpdate ? "补充内容" : "内容"}</span>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} className="w-full resize-none rounded-md border border-input bg-card px-2.5 py-1.5 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
        </label>

        {change.extracted.length ? (
          <div className="flex flex-wrap gap-1.5">
            {change.extracted.map((e) => (
              <span key={e.label} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">{e.label}：{e.value}</span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center gap-2 rounded-md bg-secondary/60 px-2.5 py-2">
        <EvidenceBadge status={verified ? "verified" : "unverified"} />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="size-3.5 accent-cobalt" />
          我有证据，标记为已核实
        </label>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{change.note}</p>

      <div className="mt-3 flex gap-2">
        <button
          disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true)
            await onConfirm(message.id, change, { type, title: title.trim(), content: content.trim() }, verified)
            setBusy(false)
          }}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {busy ? "写入中…" : isUpdate ? "确认更新" : "确认加入"}
        </button>
        <button disabled={busy} onClick={() => onDiscard(message.id)} className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary">忽略</button>
      </div>
    </div>
  )
}

function BasicsCard({
  message,
  onConfirm,
  onDiscard,
}: {
  message: Extract<Message, { kind: "basics" }>
  onConfirm: (msgId: string, change: ProposedBasicsChange, edited: Record<string, string>) => Promise<void>
  onDiscard: (msgId: string) => void
}) {
  const { change, resolved } = message
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(change.fields.map((f) => [f.key, f.after])))
  const [busy, setBusy] = useState(false)

  if (resolved) {
    return (
      <div className="ml-9 flex items-center gap-2 rounded-lg border border-cobalt/30 bg-cobalt/5 px-3 py-2 text-xs text-foreground">
        <CircleCheck className="size-4 text-cobalt" aria-hidden />
        {resolved === "discarded" ? "已忽略该建议" : "已更新基本信息"}
      </div>
    )
  }

  return (
    <div className="ml-9 rounded-xl border-[1.5px] border-foreground/15 bg-background p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-gold/20 px-2 py-0.5 text-[11px] font-semibold text-foreground">修改基本信息</span>
        <span className="text-[11px] text-muted-foreground">解析置信度 {Math.round(change.parseConfidence * 100)}%</span>
      </div>

      <div className="space-y-2.5">
        {change.fields.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
              {f.label}
              {f.before ? <span className="ml-2 text-muted-foreground/70 line-through">{f.before}</span> : null}
            </span>
            <input
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
          </label>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{change.note}</p>

      <div className="mt-3 flex gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onConfirm(message.id, change, values)
            setBusy(false)
          }}
          className="flex-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
        >
          {busy ? "更新中…" : "确认修改"}
        </button>
        <button disabled={busy} onClick={() => onDiscard(message.id)} className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary">忽略</button>
      </div>
    </div>
  )
}
