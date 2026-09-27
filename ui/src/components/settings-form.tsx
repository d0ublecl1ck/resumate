// SCR-010 设置与 Agent 运行配置。「当前运行」与「后续默认」分区（BR-D02）；
// 凭证不回显（BR-D17）；测试连接不泄露密钥。界面文案走 i18n，语言切换入口也在这里。

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { SUPPORTED_LOCALES, changeLocale, currentLocale } from "@/i18n"
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
  const { t } = useTranslation()
  const [nextMode, setNextMode] = useState<ExecutionMode>(agent.nextRunMode)
  const [autosave, setAutosave] = useState(prefs.autosave)
  const [testState, setTestState] = useState<"idle" | "testing" | "ok">("idle")
  const activeLocale = currentLocale()

  const scopes = agent.fullAccessScopes.map((scope) => t("settings.agent.fullAccessScope." + scope, { defaultValue: scope })).join(t("common.listSeparator"))
  const retained = agent.confirmRetainedOps.map((op) => t("settings.agent.confirmRetainedOp." + op, { defaultValue: op })).join(t("common.listSeparator"))
  const modeSource = t("settings.agent.source." + agent.modeSource, { defaultValue: agent.modeSource })

  return (
    <div className="space-y-6">
      {/* Agent 模式 */}
      <Section title={t("settings.agent.title")} hint={t("settings.agent.hint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("settings.agent.currentRun")}</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{agent.currentRunMode ? t("common.executionMode." + agent.currentRunMode) : t("settings.agent.noCurrentRun")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("settings.agent.modeSource", { source: modeSource })}</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("settings.agent.nextRunDefault")}</p>
            <div className="mt-2 flex gap-2">
              {(["approval", "full_access"] as ExecutionMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setNextMode(m)}
                  aria-pressed={nextMode === m}
                  className={cn("flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors", nextMode === m ? "border-cobalt bg-cobalt/5 text-foreground" : "border-border text-muted-foreground hover:bg-secondary")}
                >
                  {t("common.executionMode." + m)}
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
      </Section>

      {/* 模型配置 */}
      <Section title={t("settings.model.title")} hint={t("settings.model.hint")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <ReadField label={t("settings.model.provider")} value={model.provider} />
          <ReadField label={t("settings.model.endpoint")} value={model.endpoint} />
          <ReadField label={t("settings.model.model")} value={model.model} />
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{t("settings.model.apiKey")}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              <KeyRound className="size-3.5 text-cobalt" aria-hidden /> {model.keyConfigured ? t("settings.model.keyConfigured") : t("settings.model.keyMissing")}
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
            <RefreshCw className={cn("size-4", testState === "testing" && "animate-spin")} aria-hidden /> {t("settings.model.test")}
          </button>
          {testState === "ok" ? (
            <span className="inline-flex items-center gap-1 text-sm text-cobalt"><CheckCircle2 className="size-4" aria-hidden /> {t("settings.model.connectionOk")}</span>
          ) : model.lastTest ? (
            <span className="text-xs text-muted-foreground">{t("settings.model.lastTest", { message: model.lastTest.message })}</span>
          ) : null}
        </div>
      </Section>

      {/* 偏好 */}
      <Section title={t("settings.preferences.title")} hint={t("settings.preferences.hint")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadField label={t("settings.preferences.displayName")} value={prefs.displayName} />
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{t("settings.preferences.language")}</p>
            <div className="mt-2 flex gap-2" role="group" aria-label={t("settings.preferences.language")}>
              {SUPPORTED_LOCALES.map((locale) => (
                <button
                  key={locale.code}
                  type="button"
                  onClick={() => changeLocale(locale.code)}
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
          <label className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm text-foreground">{t("settings.preferences.autosave")}</span>
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
            <p className="text-xs text-muted-foreground">{t("settings.preferences.defaultTemplate")}</p>
            <select defaultValue={prefs.defaultTemplateId} className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30">
              {templates.filter((tpl) => tpl.status === "published").map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("settings.preferences.shortcuts")}</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {prefs.shortcuts.map((s) => (
              <li key={s.action} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
                <span className="text-foreground">{t("settings.preferences.shortcutAction." + s.action, { defaultValue: s.action })}</span>
                <span className="flex items-center gap-2">
                  <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">{s.keys}</kbd>
                  {s.conflict ? <span className="inline-flex items-center gap-1 text-xs text-coral"><AlertTriangle className="size-3" aria-hidden /> {t("settings.preferences.shortcutConflict")}</span> : null}
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
