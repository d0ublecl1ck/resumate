// 个人资料助手：一个对话抽屉，用自然语言维护主档资料。
// 既能新增/更新经历、项目、技能等条目（C-07：建议 → 显式确认后入库，默认待核实），
// 也能修改基本信息（姓名/头衔/邮箱/电话/城市）。

import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type {
  FactType,
  ProfileFact,
  ProposedBasicsChange,
  ProposedFactChange,
  ResumeBasics,
} from "@/lib/types"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { getModelConfig, parseProfileInput, createFact, updateFact, updateBasics } from "@/lib/api"
import { useRuntimeStatus } from "@/lib/runtime"
import { AgentAvailabilityNotice, agentAvailabilityFromModelConfig } from "@/components/agent-onboarding"
import { FACT_TYPE_ORDER, factTypeLabel } from "@/lib/profile"
import { EvidenceBadge } from "@/components/kit/badges"
import { cn } from "@/lib/utils"
import { Bot, CircleCheck, Loader2, Send, Sparkles, User, X } from "lucide-react"

type Message =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "agent"; text: string }
  | { id: string; kind: "fact"; change: ProposedFactChange; resolved?: "created" | "updated" | "discarded" }
  | { id: string; kind: "basics"; change: ProposedBasicsChange; resolved?: "updated" | "discarded" }

const SUGGESTIONS = [
  "profile.assistant.suggestion.phone",
  "profile.assistant.suggestion.city",
  "profile.assistant.suggestion.project",
  "profile.assistant.suggestion.skill",
]

export function ProfileAssistant({
  open,
  onClose,
  onCommitFact,
  onCommitBasics,
}: {
  open: boolean
  onClose: () => void
  onCommitFact: (fact: ProfileFact, operation: "create" | "update") => void
  onCommitBasics: (basics: ResumeBasics) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const modelQuery = useQuery({ queryKey: ["model-config"], queryFn: getModelConfig, enabled: open })
  const runtimeQuery = useRuntimeStatus(open)
  const availability = agentAvailabilityFromModelConfig(
    modelQuery.data ?? { keyConfigured: false },
    runtimeQuery.data,
  )
  const checkingAvailability = open && (modelQuery.isPending || runtimeQuery.isPending)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageSeq = useRef(0)

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
        { id: `${uid}_a`, kind: "agent", text: t("profile.assistant.msg.understoodBasics") },
        { id: `${uid}_p`, kind: "basics", change: result.change },
      ])
      return
    }

    const change = result.change
    setMessages((prev) => [
      ...prev,
      {
        id: `${uid}_a`,
        kind: "agent",
        text:
          change.operation === "update"
            ? t("profile.assistant.msg.understoodFactUpdate", { title: change.targetFactTitle })
            : t("profile.assistant.msg.understoodFactCreate"),
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
    const verb = t(finalChange.operation === "update" ? "profile.assistant.msg.resolvedFactUpdatedVerb" : "profile.assistant.msg.resolvedFactCreatedVerb")
    const evidence = t(verified ? "profile.assistant.msg.resolvedFactVerified" : "profile.assistant.msg.resolvedFactUnverified")
    setMessages((prev) => [
      ...prev,
      {
        id: `${msgId}_ok`,
        kind: "agent",
        text: t("profile.assistant.msg.resolvedFact", { verb, title: finalChange.title, evidence }),
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
      { id: `${msgId}_ok`, kind: "agent", text: t("profile.assistant.msg.basicsResolved", { fields: change.fields.map((f) => f.label).join(t("common.listSeparator")) }) },
    ])
  }

  function discard(msgId: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId && (m.kind === "fact" || m.kind === "basics") ? { ...m, resolved: "discarded" } : m)),
    )
    setMessages((prev) => [...prev, { id: `${msgId}_x`, kind: "agent", text: t("profile.assistant.msg.discarded") }])
  }

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
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
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
                <Loader2 className="size-4 animate-spin" aria-hidden /> {t("profile.assistant.thinking")}
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
              placeholder={t("profile.assistant.placeholder")}
              className="min-h-[44px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
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
  const { t } = useTranslation()
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
        {resolved === "discarded" ? t("profile.assistant.factCard.discarded") : resolved === "updated" ? t("profile.assistant.factCard.updated", { title }) : t("profile.assistant.factCard.created", { title })}
      </div>
    )
  }

  return (
    <div className="ml-9 rounded-xl border-[1.5px] border-foreground/15 bg-background p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold", isUpdate ? "bg-gold/20 text-foreground" : "bg-cobalt/10 text-cobalt")}>
          {isUpdate ? t("profile.assistant.factCard.modeUpdate") : t("profile.assistant.factCard.modeCreate")}
        </span>
        <span className="text-[11px] text-muted-foreground">{t("profile.assistant.factCard.confidence", { value: Math.round(change.parseConfidence * 100) })}</span>
      </div>

      <div className="space-y-2.5">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("profile.fields.type")}</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FactType)}
            disabled={isUpdate}
            className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
          >
            {FACT_TYPE_ORDER.map((k) => (
              <option key={k} value={k}>{factTypeLabel(t, k)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{t("profile.fields.title")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-input bg-card px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{isUpdate ? t("profile.fields.supplementContent") : t("profile.fields.content")}</span>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} className="w-full resize-none rounded-md border border-input bg-card px-2.5 py-1.5 text-sm leading-6 outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
        </label>

        {change.extracted.length ? (
          <div className="flex flex-wrap gap-1.5">
            {change.extracted.map((e) => (
              <span key={e.label} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">{t("profile.assistant.factCard.extractedPair", { label: e.label, value: e.value })}</span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center gap-2 rounded-md bg-secondary/60 px-2.5 py-2">
        <EvidenceBadge status={verified ? "verified" : "unverified"} />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-foreground">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="size-3.5 accent-cobalt" />
          {t("profile.assistant.factCard.markVerified")}
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
          {busy ? t("profile.assistant.factCard.writing") : isUpdate ? t("profile.assistant.factCard.confirmUpdate") : t("profile.assistant.factCard.confirmCreate")}
        </button>
        <button disabled={busy} onClick={() => onDiscard(message.id)} className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary">{t("profile.assistant.discard")}</button>
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
  const { t } = useTranslation()
  const { change, resolved } = message
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(change.fields.map((f) => [f.key, f.after])))
  const [busy, setBusy] = useState(false)

  if (resolved) {
    return (
      <div className="ml-9 flex items-center gap-2 rounded-lg border border-cobalt/30 bg-cobalt/5 px-3 py-2 text-xs text-foreground">
        <CircleCheck className="size-4 text-cobalt" aria-hidden />
        {resolved === "discarded" ? t("profile.assistant.basicsCard.discarded") : t("profile.assistant.basicsCard.updated")}
      </div>
    )
  }

  return (
    <div className="ml-9 rounded-xl border-[1.5px] border-foreground/15 bg-background p-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-gold/20 px-2 py-0.5 text-[11px] font-semibold text-foreground">{t("profile.assistant.basicsCard.title")}</span>
        <span className="text-[11px] text-muted-foreground">{t("profile.assistant.factCard.confidence", { value: Math.round(change.parseConfidence * 100) })}</span>
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
          {busy ? t("profile.assistant.basicsCard.updating") : t("profile.assistant.basicsCard.confirm")}
        </button>
        <button disabled={busy} onClick={() => onDiscard(message.id)} className="rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary">{t("profile.assistant.discard")}</button>
      </div>
    </div>
  )
}
