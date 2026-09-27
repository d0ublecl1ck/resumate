// SCR-010 设置与 Agent 运行配置。「当前运行」与「后续默认」分区（BR-D02）；
// 凭证不回显（BR-D17）；测试连接不泄露密钥。

import { useState } from "react"
import type { AgentConfig, ExecutionMode, ModelConfig, ResumeTemplate, UserPreferences } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw } from "lucide-react"

export function SettingsForm({
  agent,
  model,
  prefs,
  templates,
}: {
  agent: AgentConfig
  model: ModelConfig
  prefs: UserPreferences
  templates: ResumeTemplate[]
}) {
  const [nextMode, setNextMode] = useState<ExecutionMode>(agent.nextRunMode)
  const [autosave, setAutosave] = useState(prefs.autosave)
  const [testState, setTestState] = useState<"idle" | "testing" | "ok">("idle")

  return (
    <div className="space-y-6">
      {/* Agent 模式 */}
      <Section title="Agent 运行模式" hint="当前运行中的 Run 使用固化模式；这里的更改只对之后创建的 Run 生效。">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">当前运行 Run</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{agent.currentRunMode ?? "无运行中 Run"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">模式来源：{agent.modeSource}（服务端固化，不可改）</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">后续 Run 默认</p>
            <div className="mt-2 flex gap-2">
              {(["approval", "full_access"] as ExecutionMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setNextMode(m)}
                  aria-pressed={nextMode === m}
                  className={cn("flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors", nextMode === m ? "border-cobalt bg-cobalt/5 text-foreground" : "border-border text-muted-foreground hover:bg-secondary")}
                >
                  {m === "approval" ? "Approval 逐项确认" : "Full Access"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {nextMode === "full_access" ? (
          <div className="mt-3 rounded-lg border border-gold/60 bg-gold/15 p-3 text-xs leading-5 text-foreground">
            <p className="font-medium">Full Access 免确认范围：</p>
            <p className="mt-1">{agent.fullAccessScopes.join("、")}。</p>
            <p className="mt-1.5 font-medium">仍保留确认的高影响操作：</p>
            <p className="mt-1">{agent.confirmRetainedOps.join("、")}。</p>
          </div>
        ) : null}
      </Section>

      {/* 模型配置 */}
      <Section title="模型配置" hint="API Key 加密存储，界面不回显；测试连接不会泄露密钥。">
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadField label="Provider" value={model.provider} />
          <ReadField label="Endpoint" value={model.endpoint} />
          <ReadField label="Model" value={model.model} />
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">API Key</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              <KeyRound className="size-3.5 text-cobalt" aria-hidden /> {model.keyConfigured ? "已配置（不回显）" : "未配置"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => {
              setTestState("testing")
              setTimeout(() => setTestState("ok"), 700)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            <RefreshCw className={cn("size-4", testState === "testing" && "animate-spin")} aria-hidden /> 测试连接
          </button>
          {testState === "ok" ? (
            <span className="inline-flex items-center gap-1 text-sm text-cobalt"><CheckCircle2 className="size-4" aria-hidden /> 连接成功</span>
          ) : model.lastTest ? (
            <span className="text-xs text-muted-foreground">上次：{model.lastTest.message}</span>
          ) : null}
        </div>
      </Section>

      {/* 偏好 */}
      <Section title="个人偏好" hint="主题、语言、自动保存、默认模板与快捷键。部分参数（语言/时区/头像边界）依赖 D-02 冻结。">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadField label="显示名称" value={prefs.displayName} />
          <ReadField label="语言" value={prefs.language} badge="待冻结 D-02" />
          <label className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm text-foreground">自动保存（30s 静默提交）</span>
            <button
              onClick={() => setAutosave((v) => !v)}
              role="switch"
              aria-checked={autosave}
              className={cn("relative h-6 w-11 rounded-full transition-colors", autosave ? "bg-cobalt" : "bg-border")}
            >
              <span className={cn("absolute top-0.5 size-5 rounded-full bg-card transition-transform", autosave ? "translate-x-5" : "translate-x-0.5")} />
            </button>
          </label>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">默认模板</p>
            <select defaultValue={prefs.defaultTemplateId} className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30">
              {templates.filter((t) => t.status === "published").map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">快捷键</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {prefs.shortcuts.map((s) => (
              <li key={s.action} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                <span className="text-foreground">{s.action}</span>
                <span className="flex items-center gap-2">
                  <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">{s.keys}</kbd>
                  {s.conflict ? <span className="inline-flex items-center gap-1 text-xs text-coral"><AlertTriangle className="size-3" aria-hidden /> 冲突</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card-soft p-5">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {hint ? <p className="mt-1 mb-4 text-xs leading-5 text-muted-foreground">{hint}</p> : <div className="mb-4" />}
      {children}
    </section>
  )
}

function ReadField({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {label}
        {badge ? <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] text-foreground">{badge}</span> : null}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  )
}
