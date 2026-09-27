// SCR-101 创建简历 Modal。三种创建方式：对话创建 / 表单创建 / Profile 生成。
// C-01：approval 模式下 Agent 创建需二次确认；表单显式提交视为授权。
// 选材确认不等于首版文案确认。此处为前端演示：提交后跳转到编辑工作台。

import { useNavigate } from "react-router-dom"
import { useState } from "react"
import { cn } from "@/lib/utils"
import type { JobDescription, ResumeTemplate } from "@/lib/types"
import { MessageSquare, PenLine, Sparkles, X } from "lucide-react"

type Method = "chat" | "form" | "profile"

const METHODS: { key: Method; label: string; desc: string; icon: React.ElementType }[] = [
  { key: "form", label: "表单创建", desc: "从空白结构化表单开始，显式提交即授权", icon: PenLine },
  { key: "chat", label: "对话创建", desc: "用自然语言描述目标，Agent 生成首版（approval 需确认）", icon: MessageSquare },
  { key: "profile", label: "Profile 生成", desc: "选择 JD 与事实，从事实库选材生成", icon: Sparkles },
]

export function CreateResumeModal({
  open,
  onClose,
  templates,
  jds,
}: {
  open: boolean
  onClose: () => void
  templates: ResumeTemplate[]
  jds: JobDescription[]
}) {
  const navigate = useNavigate()
  const [method, setMethod] = useState<Method>("form")
  const [title, setTitle] = useState("")
  const [role, setRole] = useState("")
  const [templateId, setTemplateId] = useState(templates.find((t) => t.status === "published")?.id ?? "")
  const [jdId, setJdId] = useState("")

  if (!open) return null

  const usableTemplates = templates.filter((t) => t.status === "published")
  const needsConfirm = method === "chat" || method === "profile"

  function submit() {
    // 前端演示：真实实现会调用 POST /resumes 或发起 Agent 创建任务。
    navigate("/resumes/res_fe_lead")
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-foreground/40" aria-label="关闭" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="create-title" className="relative z-10 w-full max-w-lg card-frame max-h-[88vh] overflow-auto p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 id="create-title" className="font-serif text-2xl font-bold text-foreground">开始一份新的简历</h2>
            <p className="mt-1 text-sm text-muted-foreground">选择创建方式，锁定标题、岗位、模板与来源。</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label="关闭">
            <X className="size-5" />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium text-foreground">创建方式</legend>
          <div className="grid gap-2">
            {METHODS.map((m) => {
              const Icon = m.icon
              const active = method === m.key
              return (
                <button
                  key={m.key}
                  onClick={() => setMethod(m.key)}
                  aria-pressed={active}
                  className={cn("flex items-start gap-3 rounded-lg border p-3 text-left transition-colors", active ? "border-cobalt bg-cobalt/5" : "border-border hover:bg-secondary")}
                >
                  <Icon className={cn("mt-0.5 size-5 shrink-0", active ? "text-cobalt" : "text-muted-foreground")} aria-hidden />
                  <span>
                    <span className="block text-sm font-medium text-foreground">{m.label}</span>
                    <span className="block text-xs text-muted-foreground">{m.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-4">
          <Field label="简历标题">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：高级前端工程师简历" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
          </Field>
          <Field label="目标岗位">
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="例如：高级前端工程师" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
          </Field>
          <Field label="模板">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30">
              {usableTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} · rev.{t.revision}</option>
              ))}
            </select>
          </Field>
          {method !== "form" ? (
            <Field label="关联 JD（可选）">
              <select value={jdId} onChange={(e) => setJdId(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30">
                <option value="">不关联</option>
                {jds.map((j) => (
                  <option key={j.id} value={j.id}>{j.role}{j.company ? ` · ${j.company}` : ""} · rev.{j.revision}</option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>

        {/* 创建摘要（DES-015 影响摘要） */}
        <div className="mt-5 rounded-lg bg-secondary p-3 text-xs leading-5 text-secondary-foreground">
          <p className="font-medium text-foreground">创建摘要</p>
          <p className="mt-1">
            方式：{METHODS.find((m) => m.key === method)?.label}；标题：{title || "（未填写）"}；岗位：{role || "（未填写）"}；模板：{usableTemplates.find((t) => t.id === templateId)?.name ?? "—"}
          </p>
          {needsConfirm ? <p className="mt-1 text-coral">approval 模式：Agent 创建将展示创建摘要，需你二次确认后才会创建。</p> : <p className="mt-1">表单创建：点击「创建」即视为授权，直接创建空草稿。</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">取消</button>
          <button
            onClick={submit}
            disabled={!title || !role}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {needsConfirm ? "预览创建摘要" : "创建"}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}
