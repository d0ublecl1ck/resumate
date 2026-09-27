// SCR-010 设置与 Agent 运行配置。
// 「当前运行」与「后续默认」分区（BR-D02）；凭证不回显（BR-D17）；
// 测试连接由后端发起，任何响应都不含明文密钥；未冻结的 D-02 参数不在本地硬编码。

import { useState, type ReactNode } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { testModelConnection, updateAgentConfig, updateModelConfig, updatePreferences } from "@/lib/api"
import type { AgentConfig, ExecutionMode, ModelConfig, ModelTestResult, ResumeTemplate, UserPreferences } from "@/lib/types"
import { cn } from "@/lib/utils"
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw } from "lucide-react"

type SaveState = "idle" | "saving" | "saved" | "error"

const INPUT_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"

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
  const queryClient = useQueryClient()

  const [nextMode, setNextMode] = useState<ExecutionMode>(agent.nextRunMode)
  const [maxTokens, setMaxTokens] = useState(String(agent.budget.maxTokens))
  const [maxTurns, setMaxTurns] = useState(String(agent.budget.maxTurns))
  const [maxCost, setMaxCost] = useState(String(agent.budget.maxCostUsd))
  const [agentStatus, setAgentStatus] = useState<SaveState>("idle")

  const [provider, setProvider] = useState(model.provider)
  const [endpoint, setEndpoint] = useState(model.endpoint)
  const [modelName, setModelName] = useState(model.model)
  const [apiKey, setApiKey] = useState("")
  const [modelStatus, setModelStatus] = useState<SaveState>("idle")

  const [displayName, setDisplayName] = useState(prefs.displayName)
  const [language, setLanguage] = useState(prefs.language)
  const [theme, setTheme] = useState(prefs.theme)
  const [autosave, setAutosave] = useState(prefs.autosave)
  const [defaultTemplateId, setDefaultTemplateId] = useState(prefs.defaultTemplateId)
  const [shortcuts, setShortcuts] = useState(prefs.shortcuts)
  const [prefsStatus, setPrefsStatus] = useState<SaveState>("idle")

  const agentMutation = useMutation({
    mutationFn: () =>
      updateAgentConfig({
        nextRunMode: nextMode,
        budget: { maxTokens: Number(maxTokens), maxTurns: Number(maxTurns), maxCostUsd: Number(maxCost) },
      }),
    onMutate: () => setAgentStatus("saving"),
    onSuccess: (data) => {
      queryClient.setQueryData(["agent-config"], data)
      setAgentStatus("saved")
    },
    onError: () => setAgentStatus("error"),
  })

  const modelMutation = useMutation({
    mutationFn: () =>
      updateModelConfig({
        provider,
        endpoint,
        model: modelName,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      }),
    onMutate: () => setModelStatus("saving"),
    onSuccess: (data) => {
      queryClient.setQueryData(["model-config"], data)
      setApiKey("")
      setModelStatus("saved")
    },
    onError: () => setModelStatus("error"),
  })

  const prefsMutation = useMutation({
    mutationFn: () => updatePreferences({ displayName, language, theme, autosave, defaultTemplateId, shortcuts }),
    onMutate: () => setPrefsStatus("saving"),
    onSuccess: (data) => {
      queryClient.setQueryData(["preferences"], data)
      setShortcuts(data.shortcuts)
      setPrefsStatus("saved")
    },
    onError: () => setPrefsStatus("error"),
  })

  const testMutation = useMutation({
    mutationFn: testModelConnection,
    onSuccess: (data: ModelTestResult) => {
      queryClient.setQueryData(["model-config"], (prev: ModelConfig | undefined) => (prev ? { ...prev, lastTest: data } : prev))
      queryClient.invalidateQueries({ queryKey: ["model-config"] })
    },
  })

  const publishedTemplates = templates.filter((template) => template.status === "published")
  const testResult = testMutation.data ?? model.lastTest

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
              {(["approval", "full_access"] as ExecutionMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setNextMode(mode)
                    setAgentStatus("idle")
                  }}
                  aria-pressed={nextMode === mode}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    nextMode === mode ? "border-cobalt bg-cobalt/5 text-foreground" : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {mode === "approval" ? "Approval 逐项确认" : "Full Access"}
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
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>Token 预算上限</FieldLabel>
            <input
              type="number"
              min={1}
              className={INPUT_CLASS}
              value={maxTokens}
              onChange={(event) => {
                setMaxTokens(event.target.value)
                setAgentStatus("idle")
              }}
            />
          </label>
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>最大轮次</FieldLabel>
            <input
              type="number"
              min={1}
              className={INPUT_CLASS}
              value={maxTurns}
              onChange={(event) => {
                setMaxTurns(event.target.value)
                setAgentStatus("idle")
              }}
            />
          </label>
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>成本上限（USD）</FieldLabel>
            <input
              type="number"
              min={0}
              step="0.1"
              className={INPUT_CLASS}
              value={maxCost}
              onChange={(event) => {
                setMaxCost(event.target.value)
                setAgentStatus("idle")
              }}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => agentMutation.mutate()}
            disabled={agentMutation.isPending}
            className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            保存 Agent 配置
          </button>
          <SaveStatus state={agentStatus} error={agentMutation.error} />
        </div>
      </Section>

      {/* 模型配置 */}
      <Section title="模型配置" hint="API Key 只写入、不回显；测试连接由后端发起，界面不接触明文密钥。">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>Provider</FieldLabel>
            <input
              className={INPUT_CLASS}
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value)
                setModelStatus("idle")
              }}
            />
          </label>
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>Endpoint</FieldLabel>
            <input
              className={INPUT_CLASS}
              placeholder="https://api.example.com/v1"
              value={endpoint}
              onChange={(event) => {
                setEndpoint(event.target.value)
                setModelStatus("idle")
              }}
            />
          </label>
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>Model</FieldLabel>
            <input
              className={INPUT_CLASS}
              value={modelName}
              onChange={(event) => {
                setModelName(event.target.value)
                setModelStatus("idle")
              }}
            />
          </label>
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>API Key</FieldLabel>
            <input
              type="password"
              autoComplete="off"
              className={INPUT_CLASS}
              value={apiKey}
              placeholder={model.keyConfigured ? "已配置（留空则不修改）" : "未配置"}
              onChange={(event) => {
                setApiKey(event.target.value)
                setModelStatus("idle")
              }}
            />
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <KeyRound className="size-3.5 text-cobalt" aria-hidden /> {model.keyConfigured ? "已配置（不回显）" : "未配置"}
            </p>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => modelMutation.mutate()}
            disabled={modelMutation.isPending}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            保存模型配置
          </button>
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", testMutation.isPending && "animate-spin")} aria-hidden /> 测试连接
          </button>
          <SaveStatus state={modelStatus} error={modelMutation.error} />
          {testMutation.isPending ? <span className="text-xs text-muted-foreground">测试中…</span> : null}
          {testMutation.isError ? (
            <span className="inline-flex items-center gap-1 text-xs text-coral">
              <AlertTriangle className="size-3.5" aria-hidden /> {testMutation.error instanceof Error ? testMutation.error.message : "测试失败"}
            </span>
          ) : null}
          {!testMutation.isPending && !testMutation.isError && testResult ? (
            <span className={cn("inline-flex items-center gap-1 text-xs", testResult.ok ? "text-cobalt" : "text-coral")}>
              {testResult.ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
              {testResult.message}
            </span>
          ) : null}
        </div>
      </Section>

      {/* 偏好 */}
      <Section title="个人偏好" hint="主题、语言、自动保存与默认模板；语言与头像边界依赖 D-02 冻结，这里不做本地硬编码。">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>显示名称</FieldLabel>
            <input
              className={INPUT_CLASS}
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value)
                setPrefsStatus("idle")
              }}
            />
          </label>
          <label className="rounded-lg border border-border p-3">
            <FieldLabel badge="待冻结 D-02">界面语言</FieldLabel>
            <input
              className={INPUT_CLASS}
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value)
                setPrefsStatus("idle")
              }}
            />
          </label>
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>主题</FieldLabel>
            <select
              className={INPUT_CLASS}
              value={theme}
              onChange={(event) => {
                setTheme(event.target.value as UserPreferences["theme"])
                setPrefsStatus("idle")
              }}
            >
              <option value="paper">纸感（浅色）</option>
              <option value="dark">深色</option>
            </select>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">深色令牌尚未定义，当前只持久化选择。</p>
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm text-foreground">自动保存（30s 静默提交）</span>
            <button
              type="button"
              onClick={() => {
                setAutosave((value) => !value)
                setPrefsStatus("idle")
              }}
              role="switch"
              aria-checked={autosave}
              aria-label="自动保存"
              className={cn("relative h-6 w-11 rounded-full transition-colors", autosave ? "bg-cobalt" : "bg-border")}
            >
              <span className={cn("absolute top-0.5 size-5 rounded-full bg-card transition-transform", autosave ? "translate-x-5" : "translate-x-0.5")} />
            </button>
          </label>
          <div className="rounded-lg border border-border p-3">
            <FieldLabel>默认模板</FieldLabel>
            <select
              className={INPUT_CLASS}
              value={defaultTemplateId}
              onChange={(event) => {
                setDefaultTemplateId(event.target.value)
                setPrefsStatus("idle")
              }}
            >
              <option value="">不设置</option>
              {prefs.defaultTemplateRetired && defaultTemplateId ? <option value={defaultTemplateId}>（不可用）{defaultTemplateId}</option> : null}
              {publishedTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {prefs.defaultTemplateRetired ? (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-coral">
                <AlertTriangle className="size-3" aria-hidden /> 已保存的默认模板不可用，请重新选择
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">快捷键</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {shortcuts.map((shortcut, index) => (
              <li key={shortcut.action} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                <span className="text-foreground">{shortcut.action}</span>
                <span className="flex items-center gap-2">
                  <input
                    aria-label={shortcut.action + " 快捷键"}
                    value={shortcut.keys}
                    onChange={(event) => {
                      const keys = event.target.value
                      setShortcuts((items) => items.map((item, position) => (position === index ? { ...item, keys } : item)))
                      setPrefsStatus("idle")
                    }}
                    className="w-24 rounded-md border border-input bg-background px-2 py-1 text-center font-mono text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                  />
                  {shortcut.conflict ? (
                    <span className="inline-flex items-center gap-1 text-xs text-coral">
                      <AlertTriangle className="size-3" aria-hidden /> 冲突
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">同一按键不能绑定多个动作；冲突会在保存时被后端拒绝并保留原映射。</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => prefsMutation.mutate()}
            disabled={prefsMutation.isPending}
            className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            保存偏好
          </button>
          <SaveStatus state={prefsStatus} error={prefsMutation.error} />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card-soft p-5">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {hint ? <p className="mt-1 mb-4 text-xs leading-5 text-muted-foreground">{hint}</p> : <div className="mb-4" />}
      {children}
    </section>
  )
}

function FieldLabel({ children, badge }: { children: ReactNode; badge?: string }) {
  return (
    <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      {children}
      {badge ? <span className="rounded bg-gold/20 px-1.5 py-0.5 text-[10px] text-foreground">{badge}</span> : null}
    </span>
  )
}

function SaveStatus({ state, error }: { state: SaveState; error: unknown }) {
  if (state === "saving") return <span className="text-xs text-muted-foreground">保存中…</span>
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-cobalt">
        <CheckCircle2 className="size-3.5" aria-hidden /> 已保存
      </span>
    )
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-coral">
        <AlertTriangle className="size-3.5" aria-hidden /> {error instanceof Error ? error.message : "保存失败"}
      </span>
    )
  }
  return null
}
