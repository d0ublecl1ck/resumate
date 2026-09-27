// SCR-011 开放接入与访问审计 + SCR-111 PAT 创建/撤销 Modal。
// 凭证仅创建成功时显示一次（BR-D17）；撤销后刷新列表与审计日志。
// 后端已落地 PAT 签发/撤销/日志/能力发现，界面文案统一走 i18n。

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { createPat, revokePat } from "@/lib/api"
import type { AccessLogEntry, CapabilityDiscovery, PersonalAccessToken } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Ban, Copy, KeyRound, Plus, ShieldCheck, X } from "lucide-react"

const PAT_STATUS: Record<PersonalAccessToken["status"], { labelKey: string; tone: string }> = {
  active: { labelKey: "settings.pat.status.active", tone: "text-cobalt border-cobalt/40 bg-cobalt/5" },
  expiring: { labelKey: "settings.pat.status.expiring", tone: "text-foreground border-gold/70 bg-gold/20" },
  revoked: { labelKey: "settings.pat.status.revoked", tone: "text-muted-foreground border-border bg-muted" },
}

const RESULT_META: Record<AccessLogEntry["result"], { labelKey: string; tone: string }> = {
  allowed: { labelKey: "settings.accessLog.resultValue.allowed", tone: "text-cobalt" },
  denied: { labelKey: "settings.accessLog.resultValue.denied", tone: "text-coral" },
  frozen: { labelKey: "settings.accessLog.resultValue.frozen", tone: "text-muted-foreground" },
}

const SCOPES = ["profile:read", "resume:read", "resume:write", "jd:read", "jd:write"]

export function AccessPanel({
  pats,
  logs,
  capability,
  onChanged,
}: {
  pats: PersonalAccessToken[]
  logs: AccessLogEntry[]
  capability: CapabilityDiscovery
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const separator = t("common.listSeparator")

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokePat(id),
    onSuccess: () => onChanged(),
  })

  return (
    <div className="space-y-6">
      <section className="card-soft p-5">
        <h2 className="text-sm font-bold text-foreground">{t("settings.capability.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("settings.capability.meta", { version: capability.contractVersion, methods: capability.authMethods.join(separator) })}</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <CopyField label={t("settings.capability.discovery")} value={capability.wellKnownUrl} />
          <CopyField label={t("settings.capability.openapi")} value={capability.openapiUrl} />
          <CopyField label={t("settings.capability.mcp")} value={capability.mcpUrl} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {capability.capabilities.map((item) => (
            <span key={item} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">{item}</span>
          ))}
        </div>
      </section>

      <section className="card-soft p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">{t("settings.pat.title")}</h2>
          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> {t("settings.pat.create")}
          </button>
        </div>
        <ul className="space-y-3">
          {pats.map((pat) => (
            <li key={pat.id} className={cn("rounded-lg border p-3", pat.status === "revoked" ? "border-border bg-muted/40 opacity-70" : "border-border")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><KeyRound className="size-3.5 text-cobalt" aria-hidden /> {pat.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{pat.purpose}</p>
                </div>
                <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium", PAT_STATUS[pat.status].tone)}>{t(PAT_STATUS[pat.status].labelKey)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pat.scopes.map((scope) => (
                  <span key={scope} className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground">{scope}</span>
                ))}
                {pat.fields.map((field) => (
                  <span key={field} className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{field}</span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("settings.pat.resourcesLabel", { resources: pat.resources.join(separator) })} · {t("settings.pat.expiresAt", { date: pat.expiresAt.slice(0, 10) })}
                {pat.lastUsedAt ? " · " + t("settings.pat.lastUsedAt", { date: pat.lastUsedAt.slice(0, 10) }) : " · " + t("settings.pat.neverUsed")}
              </p>
              {pat.status !== "revoked" ? (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={() => revokeMutation.mutate(pat.id)}
                    disabled={revokeMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-coral/40 px-2.5 py-1 text-xs font-medium text-coral hover:bg-coral/5 disabled:opacity-60"
                  >
                    <Ban className="size-3.5" aria-hidden /> {t("settings.pat.revoke")}
                  </button>
                  {revokeMutation.isError ? <span className="text-xs text-coral">{t("settings.pat.revokeFailed")}</span> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="card-soft p-5">
        <h2 className="mb-3 text-sm font-bold text-foreground">{t("settings.accessLog.title")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">{t("settings.accessLog.time")}</th>
                <th className="py-2 pr-4 font-medium">{t("settings.accessLog.client")}</th>
                <th className="py-2 pr-4 font-medium">{t("settings.accessLog.scope")}</th>
                <th className="py-2 pr-4 font-medium">{t("settings.accessLog.resource")}</th>
                <th className="py-2 pr-4 font-medium">{t("settings.accessLog.purpose")}</th>
                <th className="py-2 font-medium">{t("settings.accessLog.result")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border/60">
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{log.at.slice(5, 16).replace("T", " ")}</td>
                  <td className="py-2 pr-4">{log.clientId}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{log.scope}</td>
                  <td className="py-2 pr-4 text-xs">{log.resource}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{t("settings.accessLog.purposeValue." + log.purpose, { defaultValue: log.purpose })}</td>
                  <td className="py-2">
                    <span className={cn("text-xs font-semibold", RESULT_META[log.result].tone)}>{t(RESULT_META[log.result].labelKey)}</span>
                    {log.errorCode ? <span className="ml-1 font-mono text-[10px] text-muted-foreground">{log.errorCode}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen ? <PatModal onClose={() => setCreateOpen(false)} onCreated={onChanged} /> : null}
    </div>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xs text-foreground" title={value}>{value}</p>
    </div>
  )
}

function PatModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<string[]>(["profile:read", "resume:read"])
  const [secret, setSecret] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => createPat({ name: name.trim(), scopes }),
    onSuccess: (token) => {
      setSecret(token.secretOnce ?? "")
      onCreated()
    },
  })

  function toggleScope(scope: string) {
    setScopes((items) => (items.includes(scope) ? items.filter((item) => item !== scope) : [...items, scope]))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-foreground/40" aria-label={t("common.actions.close")} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="pat-title" className="relative z-10 w-full max-w-md card-frame p-6">
        <div className="flex items-start justify-between">
          <h2 id="pat-title" className="font-serif text-xl font-bold text-foreground">{t("settings.patModal.title")}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label={t("common.actions.close")}><X className="size-5" /></button>
        </div>

        {secret === null ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{t("settings.patModal.description")}</p>
            <label className="mt-4 block">
              <span className="text-xs font-medium text-muted-foreground">{t("settings.patModal.name")}</span>
              <input
                className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                value={name}
                placeholder={t("settings.patModal.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="mt-4 space-y-2">
              {SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} /> <span className="font-mono text-xs">{scope}</span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              {createMutation.isError ? <span className="text-xs text-coral">{t("settings.patModal.createFailed")}</span> : null}
              <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">{t("common.actions.cancel")}</button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || name.trim().length === 0 || scopes.length === 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {createMutation.isPending ? t("settings.patModal.creating") : t("common.actions.create")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-cobalt/40 bg-cobalt/5 p-3 text-sm text-foreground">
              <ShieldCheck className="size-4 shrink-0 text-cobalt" aria-hidden />
              {t("settings.patModal.secretOnce")}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{secret}</code>
              <button
                onClick={() => void navigator.clipboard?.writeText(secret)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
              >
                <Copy className="size-3.5" aria-hidden /> {t("common.actions.copy")}
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{t("common.actions.done")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
