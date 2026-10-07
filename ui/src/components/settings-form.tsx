// SCR-010 设置与 Agent 运行配置。
// 「当前运行」与「后续默认」分区（BR-D02）；凭证不回显（BR-D17）；
// 测试连接由后端发起，任何响应都不含明文密钥。界面文案统一走 i18n。

import { useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { SUPPORTED_LOCALES, changeLocale, currentLocale } from "@/i18n"
import { getModelCatalog, testModelConnection, updateAgentConfig, updateModelConfig, updatePreferences } from "@/lib/api"
import type { AgentConfig, ExecutionMode, ModelConfig, ModelTestResult, ResumeTemplate, UserPreferences } from "@/lib/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AgentAvailabilityNotice, agentAvailabilityFromModelConfig } from "@/components/agent-onboarding"
import { MAX_AUTOSAVE_SECONDS, MIN_AUTOSAVE_SECONDS, clampAutosaveSeconds } from "@/lib/autosave"
import { useRuntimeStatus } from "@/lib/runtime"
import { cn } from "@/lib/utils"
import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw } from "lucide-react"

type SaveState = "idle" | "saving" | "saved" | "error"

const INPUT_CLASS =
  "mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"

// 模型目录只暴露白名单 provider（issue 7aa58）。这个哨兵值只存在于下拉，不落库：
// 选中它时 provider 与 model 换成文本输入，用户才填得出目录外的服务。
const CUSTOM_PROVIDER = "__custom__"


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
  const { t } = useTranslation()
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
  const [theme, setTheme] = useState(prefs.theme)
  const [autosave, setAutosave] = useState(prefs.autosave)
  const [autosaveSeconds, setAutosaveSeconds] = useState(clampAutosaveSeconds(prefs.autosaveIntervalSeconds))
  const [defaultTemplateId, setDefaultTemplateId] = useState(prefs.defaultTemplateId)
  const [shortcuts, setShortcuts] = useState(prefs.shortcuts)
  const [prefsStatus, setPrefsStatus] = useState<SaveState>("idle")

  const activeLocale = currentLocale()
  const separator = t("common.listSeparator")
  const scopes = agent.fullAccessScopes.map((scope) => t("settings.agent.fullAccessScope." + scope, { defaultValue: scope })).join(separator)
  const retained = agent.confirmRetainedOps.map((op) => t("settings.agent.confirmRetainedOp." + op, { defaultValue: op })).join(separator)
  const modeSource = t("settings.agent.source." + agent.modeSource, { defaultValue: agent.modeSource })

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
    mutationFn: () =>
      updatePreferences({
        displayName,
        theme,
        autosave,
        autosaveIntervalSeconds: clampAutosaveSeconds(autosaveSeconds),
        defaultTemplateId,
        shortcuts,
      }),
    onMutate: () => setPrefsStatus("saving"),
    onSuccess: (data) => {
      queryClient.setQueryData(["preferences"], data)
      setShortcuts(data.shortcuts)
      setPrefsStatus("saved")
    },
    onError: () => setPrefsStatus("error"),
  })

  const languageMutation = useMutation({
    mutationFn: (code: string) => updatePreferences({ language: code }),
    onSuccess: (data) => queryClient.setQueryData(["preferences"], data),
  })

  const testMutation = useMutation({
    mutationFn: testModelConnection,
    onSuccess: (data: ModelTestResult) => {
      queryClient.setQueryData(["model-config"], (prev: ModelConfig | undefined) => (prev ? { ...prev, lastTest: data } : prev))
      queryClient.invalidateQueries({ queryKey: ["model-config"] })
    },
  })

  const publishedTemplates = templates.filter((tpl) => tpl.status === "published")
  const testResult = testMutation.data ?? model.lastTest

  // 模型目录（契约 §17）：provider / model 只从只读目录选择；目录失败时保留已保存值。
  const catalogQuery = useQuery({ queryKey: ["model-catalog"], queryFn: () => getModelCatalog() })
  const runtimeQuery = useRuntimeStatus()
  const catalogProviders = catalogQuery.data?.providers ?? []
  const selectedProvider = catalogProviders.find((item) => item.id === provider)
  const selectedModel = selectedProvider?.models.find((item) => item.id === modelName)

  // 目录只暴露白名单 provider（issue 7aa58）：已保存值不在目录里就是「自定义」，
  // 此时 provider 与 model 由下拉换成文本输入，任意 OpenAI 兼容服务都能填。
  const customProvider = provider !== "" && !catalogProviders.some((item) => item.id === provider)
  const providerOptions = [
    { value: "", label: t("settings.model.providerNone") },
    ...catalogProviders.map((item) => ({ value: item.id, label: item.label })),
    { value: CUSTOM_PROVIDER, label: t("settings.model.providerCustom") },
    ...(customProvider && provider !== CUSTOM_PROVIDER
      ? [{ value: provider, label: t("settings.model.catalogMissingOption", { id: provider }) }]
      : []),
  ]
  const modelOptions = selectedProvider
    ? [
        { value: "", label: t("settings.model.modelNone") },
        ...selectedProvider.models.map((item) => ({ value: item.id, label: item.label })),
        ...(modelName && !selectedProvider.models.some((item) => item.id === modelName)
          ? [{ value: modelName, label: t("settings.model.catalogMissingOption", { id: modelName }) }]
          : []),
      ]
    : [
        { value: "", label: t("settings.model.modelNone") },
        ...(modelName ? [{ value: modelName, label: t("settings.model.catalogMissingOption", { id: modelName }) }] : []),
      ]

  return (
    <div className="space-y-6">
      <Section title={t("settings.agent.title")} hint={t("settings.agent.hint")}>
        {model.keyConfigured && runtimeQuery.isPending ? null : (
          <AgentAvailabilityNotice
            state={agentAvailabilityFromModelConfig(model, runtimeQuery.data)}
            placement="entry"
            className="mb-4"
            onAction={() => document.getElementById("settings-model-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("settings.agent.currentRun")}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{agent.currentRunMode ? t("common.executionMode." + agent.currentRunMode) : t("settings.agent.noCurrentRun")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("settings.agent.modeSource", { source: modeSource })}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("settings.agent.nextRunDefault")}</p>
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
                  className={cn("flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors", nextMode === mode ? "border-cobalt bg-cobalt/5 text-foreground" : "border-border text-muted-foreground hover:bg-secondary")}
                >
                  {t("common.executionMode." + mode)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {nextMode === "full_access" ? (
          <div className="mt-3 rounded-lg border border-gold/60 bg-gold/15 p-3 text-xs leading-5 text-foreground">
            <p className="font-medium">{t("settings.agent.fullAccessScopes")}</p>
            <p className="mt-1">{scopes}。</p>
            <p className="mt-1.5 font-medium">{t("settings.agent.confirmRetainedOps")}</p>
            <p className="mt-1">{retained}。</p>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>{t("settings.agent.tokenLimit")}</FieldLabel>
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
            <FieldLabel>{t("settings.agent.maxTurns")}</FieldLabel>
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
            <FieldLabel>{t("settings.agent.costLimit")}</FieldLabel>
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
        <SaveRow label={t("settings.agent.save")} pending={agentMutation.isPending} state={agentStatus} error={agentMutation.error} onSave={() => agentMutation.mutate()} />
      </Section>

      <Section id="settings-model-section" title={t("settings.model.title")} hint={t("settings.model.hint")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <FieldLabel>{t("settings.model.provider")}</FieldLabel>
            {customProvider ? (
              <input
                className={INPUT_CLASS}
                aria-label={t("settings.model.provider")}
                placeholder={t("settings.model.providerCustomPlaceholder")}
                value={provider === CUSTOM_PROVIDER ? "" : provider}
                onChange={(event) => {
                  setProvider(event.target.value)
                  setModelStatus("idle")
                }}
              />
            ) : (
              <Select
                items={providerOptions}
                value={provider}
                onValueChange={(next) => {
                  const nextProviderId = String(next ?? "")
                  if (nextProviderId === CUSTOM_PROVIDER) {
                    // 保留已保存的自定义标识便于继续编辑；白名单 provider 则清空让用户重填。
                    setProvider(catalogProviders.some((item) => item.id === provider) ? "" : provider)
                    setModelStatus("idle")
                    return
                  }
                  setProvider(nextProviderId)
                  const nextProvider = catalogProviders.find((item) => item.id === nextProviderId)
                  setModelName(nextProvider?.models[0]?.id ?? "")
                  setModelStatus("idle")
                }}
              >
                <SelectTrigger className="mt-1" aria-label={t("settings.model.provider")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((option) => (
                    <SelectItem key={option.value || "__none__"} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="rounded-lg border border-border p-3">
            <FieldLabel>{t("settings.model.model")}</FieldLabel>
            {customProvider ? (
              <input
                className={INPUT_CLASS}
                aria-label={t("settings.model.model")}
                placeholder={t("settings.model.modelNone")}
                value={modelName}
                onChange={(event) => {
                  setModelName(event.target.value)
                  setModelStatus("idle")
                }}
              />
            ) : (
            <Select
              items={modelOptions}
              value={modelName}
              disabled={!selectedProvider}
              onValueChange={(next) => {
                setModelName(String(next ?? ""))
                setModelStatus("idle")
              }}
            >
              <SelectTrigger className="mt-1" aria-label={t("settings.model.model")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelOptions.map((option) => (
                  <SelectItem key={option.value || "__none__"} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            )}
            {selectedModel ? (
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {[
                  selectedModel.contextWindow !== undefined ? t("settings.model.contextWindow", { tokens: selectedModel.contextWindow }) : null,
                  selectedModel.inputCostPerMillion !== undefined || selectedModel.outputCostPerMillion !== undefined
                    ? t("settings.model.pricePerMillion", {
                        input: selectedModel.inputCostPerMillion ?? "-",
                        output: selectedModel.outputCostPerMillion ?? "-",
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(separator)}
              </p>
            ) : null}
          </div>
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>{t("settings.model.endpoint")}</FieldLabel>
            <input
              className={INPUT_CLASS}
              placeholder={t("settings.model.endpointPlaceholder")}
              value={endpoint}
              onChange={(event) => {
                setEndpoint(event.target.value)
                setModelStatus("idle")
              }}
            />
          </label>
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>{t("settings.model.apiKey")}</FieldLabel>
            <input
              type="password"
              autoComplete="off"
              className={INPUT_CLASS}
              value={apiKey}
              placeholder={model.keyConfigured ? t("settings.model.keyConfiguredPlaceholder") : t("settings.model.keyMissingPlaceholder")}
              onChange={(event) => {
                setApiKey(event.target.value)
                setModelStatus("idle")
              }}
            />
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <KeyRound className="size-3.5 text-cobalt" aria-hidden /> {model.keyConfigured ? t("settings.model.keyConfigured") : t("settings.model.keyMissing")}
            </p>
          </label>
        </div>
        {catalogQuery.isPending ? <p className="mt-3 text-xs text-muted-foreground">{t("settings.model.catalogLoading")}</p> : null}
        {catalogQuery.isError ? (
          <p className="mt-3 inline-flex items-center gap-1 text-xs text-coral">
            <AlertTriangle className="size-3.5" aria-hidden /> {t("settings.model.catalogError")}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => modelMutation.mutate()}
            disabled={modelMutation.isPending}
            className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {t("settings.model.save")}
          </button>
          <button
            type="button"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", testMutation.isPending && "animate-spin")} aria-hidden /> {t("settings.model.test")}
          </button>
          <SaveStatus state={modelStatus} error={modelMutation.error} />
          {testMutation.isPending ? <span className="text-xs text-muted-foreground">{t("settings.model.testing")}</span> : null}
          {testMutation.isError ? (
            <span className="inline-flex items-center gap-1 text-xs text-coral">
              <AlertTriangle className="size-3.5" aria-hidden /> {t("settings.model.testFailed")}
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

      <Section title={t("settings.preferences.title")} hint={t("settings.preferences.hint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>{t("settings.preferences.displayName")}</FieldLabel>
            <input
              className={INPUT_CLASS}
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value)
                setPrefsStatus("idle")
              }}
            />
          </label>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{t("settings.preferences.language")}</p>
            <div className="mt-2 flex gap-2" role="group" aria-label={t("settings.preferences.language")}>
              {SUPPORTED_LOCALES.map((locale) => (
                <button
                  key={locale.code}
                  type="button"
                  onClick={() => {
                    changeLocale(locale.code)
                    languageMutation.mutate(locale.code)
                  }}
                  aria-pressed={activeLocale === locale.code}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    activeLocale === locale.code ? "border-cobalt bg-cobalt/5 text-foreground" : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {t(locale.labelKey)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{t("settings.preferences.languageHint")}</p>
          </div>
          <label className="rounded-lg border border-border p-3">
            <FieldLabel>{t("settings.preferences.theme")}</FieldLabel>
            <select
              className={INPUT_CLASS}
              value={theme}
              onChange={(event) => {
                setTheme(event.target.value as UserPreferences["theme"])
                setPrefsStatus("idle")
              }}
            >
              <option value="paper">{t("settings.preferences.themePaper")}</option>
              <option value="dark">{t("settings.preferences.themeDark")}</option>
            </select>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t("settings.preferences.themeHint")}</p>
          </label>
          <label className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm text-foreground">{t("settings.preferences.autosave")}</span>
            <button
              type="button"
              onClick={() => {
                setAutosave((value) => !value)
                setPrefsStatus("idle")
              }}
              role="switch"
              aria-checked={autosave}
              aria-label={t("settings.preferences.autosave")}
              className={cn("relative h-6 w-11 rounded-full transition-colors", autosave ? "bg-cobalt" : "bg-border")}
            >
              <span className={cn("absolute top-0.5 size-5 rounded-full bg-card transition-transform", autosave ? "translate-x-5" : "translate-x-0.5")} />
            </button>
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span>
              <span className="block text-sm text-foreground">{t("settings.preferences.autosaveInterval")}</span>
              <span className="block text-xs text-muted-foreground">
                {t("settings.preferences.autosaveIntervalHint", { min: MIN_AUTOSAVE_SECONDS, max: MAX_AUTOSAVE_SECONDS })}
              </span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_AUTOSAVE_SECONDS}
              max={MAX_AUTOSAVE_SECONDS}
              disabled={!autosave}
              value={autosaveSeconds}
              onChange={(event) => {
                setAutosaveSeconds(Number(event.target.value))
                setPrefsStatus("idle")
              }}
              aria-label={t("settings.preferences.autosaveInterval")}
              className={cn(INPUT_CLASS, "w-24 disabled:opacity-60")}
            />
          </label>
          <div className="rounded-lg border border-border p-3">
            <FieldLabel>{t("settings.preferences.defaultTemplate")}</FieldLabel>
            <select
              className={INPUT_CLASS}
              value={defaultTemplateId}
              onChange={(event) => {
                setDefaultTemplateId(event.target.value)
                setPrefsStatus("idle")
              }}
            >
              <option value="">{t("settings.preferences.defaultTemplateNone")}</option>
              {prefs.defaultTemplateRetired && defaultTemplateId ? (
                <option value={defaultTemplateId}>{t("settings.preferences.defaultTemplateUnavailableOption", { id: defaultTemplateId })}</option>
              ) : null}
              {publishedTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            {prefs.defaultTemplateRetired ? (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-coral">
                <AlertTriangle className="size-3" aria-hidden /> {t("settings.preferences.defaultTemplateUnavailable")}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("settings.preferences.shortcuts")}</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {shortcuts.map((shortcut, index) => {
              const actionLabel = t("settings.preferences.shortcutAction." + shortcut.action, { defaultValue: shortcut.action })
              return (
                <li key={shortcut.action} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                  <span className="text-foreground">{actionLabel}</span>
                  <span className="flex items-center gap-2">
                    <input
                      aria-label={t("settings.preferences.shortcutEditAria", { action: actionLabel })}
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
                        <AlertTriangle className="size-3" aria-hidden /> {t("settings.preferences.shortcutConflict")}
                      </span>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">{t("settings.preferences.shortcutEditHint")}</p>
        </div>

        <SaveRow label={t("settings.preferences.save")} pending={prefsMutation.isPending} state={prefsStatus} error={prefsMutation.error} onSave={() => prefsMutation.mutate()} />
      </Section>
    </div>
  )
}

function SaveRow({ label, pending, state, error, onSave }: { label: string; pending: boolean; state: SaveState; error: unknown; onSave: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {label}
      </button>
      <SaveStatus state={state} error={error} />
    </div>
  )
}

function Section({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="card-soft p-5">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {hint ? <p className="mt-1 mb-4 text-xs leading-5 text-muted-foreground">{hint}</p> : <div className="mb-4" />}
      {children}
    </section>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium text-muted-foreground">{children}</span>
}

function SaveStatus({ state, error }: { state: SaveState; error: unknown }) {
  const { t } = useTranslation()
  if (state === "saving") return <span className="text-xs text-muted-foreground">{t("settings.save.saving")}</span>
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-cobalt">
        <CheckCircle2 className="size-3.5" aria-hidden /> {t("settings.save.saved")}
      </span>
    )
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-coral">
        <AlertTriangle className="size-3.5" aria-hidden /> {error instanceof Error ? error.message : t("settings.save.failed")}
      </span>
    )
  }
  return null
}
