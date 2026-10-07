// SCR-011 开放接入与访问审计 + SCR-111 PAT 创建/撤销 Modal。
// 凭证仅创建成功时显示一次（BR-D17）；撤销后刷新列表与审计日志。
// 审计日志按用途 / 结果 / 关键字筛选并分页：page/size 走查询参数，总条数读 X-Total-Count（c3825）。
// 缺 access:write 时创建与撤销入口禁用并说明原因。
// 后端已落地 PAT 签发/撤销/日志/能力发现，界面文案统一走 i18n。

import { useEffect, useRef, useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { createPat, revokePat } from "@/lib/api"
import type { AccessLogEntry, CapabilityDiscovery, PersonalAccessToken } from "@/lib/types"
import { Modal } from "@/components/ui/modal"
import { StateBlock } from "@/components/kit/state-block"
import { cn } from "@/lib/utils"
import { Ban, Copy, KeyRound, Plus, Search, ShieldCheck } from "lucide-react"

/** 审计日志筛选条件；空字符串表示不筛选。 */
export interface AccessLogFilters {
  purpose: string
  result: "" | AccessLogEntry["result"]
  query: string
}

export type AccessLogsState = "loading" | "error" | "ready"

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
const PURPOSE_OPTIONS = [
  "token_create",
  "token_revoke",
  "pat_auth",
  "pat_scope",
  "pat_human_session",
  "run_token_auth",
  "run_token_scope",
  "run_human_session",
]
const RESULT_OPTIONS: AccessLogEntry["result"][] = ["allowed", "denied", "frozen"]
const FIELD_CLASS = "rounded-lg border border-input bg-card px-2.5 py-2 text-sm text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
const PAGE_BUTTON_CLASS =
  "rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"

export function AccessPanel({
  pats,
  logs,
  logsState,
  capability,
  canWrite,
  filters,
  onFiltersChange,
  page,
  pageSize,
  total,
  onPageChange,
  onChanged,
}: {
  pats: PersonalAccessToken[]
  logs: AccessLogEntry[]
  logsState: AccessLogsState
  capability: CapabilityDiscovery
  canWrite: boolean
  filters: AccessLogFilters
  onFiltersChange: (patch: Partial<AccessLogFilters>) => void
  page: number
  pageSize: number
  total: number | null
  onPageChange: (page: number) => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const separator = t("common.listSeparator")
  const hasFilters = Boolean(filters.purpose || filters.result || filters.query)
  const totalPages = total === null ? null : Math.ceil(total / pageSize)
  const hasNext = totalPages === null ? logs.length >= pageSize : page < totalPages

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokePat(id),
    onSuccess: () => onChanged(),
  })

  return (
    <div className="space-y-6">
      <section className="card-soft p-5">
        <h2 className="text-sm font-bold text-foreground">{t("settings.capability.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("settings.capability.meta", { version: capability.contractVersion, methods: capability.authMethods.join(separator) })}</p>
        <dl className="mt-3 grid min-w-0 gap-2 sm:grid-cols-3">
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
          <button
            onClick={() => setCreateOpen(true)}
            disabled={!canWrite}
            title={canWrite ? undefined : t("settings.access.writeDenied")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-4" aria-hidden /> {t("settings.pat.create")}
          </button>
        </div>
        {!canWrite ? <p className="mb-3 text-xs text-muted-foreground">{t("settings.access.writeDenied")}</p> : null}
        {pats.length === 0 ? (
          <StateBlock kind="empty" title={t("settings.pat.empty.title")} description={t("settings.pat.empty.description")} />
        ) : (
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
                      disabled={!canWrite || revokeMutation.isPending}
                      title={canWrite ? undefined : t("settings.access.writeDenied")}
                      className="inline-flex items-center gap-1 rounded-md border border-coral/40 px-2.5 py-1 text-xs font-medium text-coral hover:bg-coral/5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Ban className="size-3.5" aria-hidden /> {t("settings.pat.revoke")}
                    </button>
                    {revokeMutation.isError ? <span className="text-xs text-coral">{t("settings.pat.revokeFailed")}</span> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card-soft p-5">
        <h2 className="mb-3 text-sm font-bold text-foreground">{t("settings.accessLog.title")}</h2>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <FilterField label={t("settings.accessLog.filters.purpose")}>
            <select
              aria-label={t("settings.accessLog.filters.purpose")}
              value={filters.purpose}
              onChange={(event) => onFiltersChange({ purpose: event.target.value })}
              className={FIELD_CLASS}
            >
              <option value="">{t("settings.accessLog.filters.purposeAll")}</option>
              {PURPOSE_OPTIONS.map((purpose) => (
                <option key={purpose} value={purpose}>
                  {t("settings.accessLog.purposeValue." + purpose, { defaultValue: purpose })}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t("settings.accessLog.filters.result")}>
            <select
              aria-label={t("settings.accessLog.filters.result")}
              value={filters.result}
              onChange={(event) => onFiltersChange({ result: event.target.value as AccessLogFilters["result"] })}
              className={FIELD_CLASS}
            >
              <option value="">{t("settings.accessLog.filters.resultAll")}</option>
              {RESULT_OPTIONS.map((result) => (
                <option key={result} value={result}>
                  {t("settings.accessLog.resultValue." + result)}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t("settings.accessLog.filters.keyword")} grow>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                aria-label={t("settings.accessLog.filters.keyword")}
                value={filters.query}
                onChange={(event) => onFiltersChange({ query: event.target.value })}
                placeholder={t("settings.accessLog.filters.keyword")}
                className={cn(FIELD_CLASS, "w-full pl-8")}
              />
            </span>
          </FilterField>
        </div>

        {logsState === "loading" ? (
          <StateBlock kind="loading" title={t("settings.accessLog.loading")} />
        ) : logsState === "error" ? (
          <StateBlock kind="error" title={t("settings.accessLog.errorTitle")} description={t("settings.accessLog.errorDescription")} />
        ) : logs.length === 0 ? (
          <StateBlock
            kind="empty"
            title={hasFilters ? t("settings.accessLog.emptyFiltered.title") : t("settings.accessLog.empty.title")}
            description={hasFilters ? t("settings.accessLog.emptyFiltered.description") : t("settings.accessLog.empty.description")}
          />
        ) : (
          <>
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
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{total === null ? null : t("settings.accessLog.pagination.total", { total })}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className={PAGE_BUTTON_CLASS}>
                  {t("settings.accessLog.pagination.previous")}
                </button>
                <span>
                  {totalPages === null
                    ? t("settings.accessLog.pagination.pageOnly", { page })
                    : t("settings.accessLog.pagination.page", { page, pages: totalPages })}
                </span>
                <button type="button" onClick={() => onPageChange(page + 1)} disabled={!hasNext} className={PAGE_BUTTON_CLASS}>
                  {t("settings.accessLog.pagination.next")}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <PatModal open={createOpen} onOpenChange={setCreateOpen} onCreated={onChanged} />
    </div>
  )
}

function FilterField({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1 text-xs text-muted-foreground", grow && "min-w-[200px] flex-1")}>
      <span>{label}</span>
      {children}
    </div>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xs text-foreground" title={value}>{value}</p>
    </div>
  )
}

function PatModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<string[]>(["profile:read", "resume:read"])
  const [secret, setSecret] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // 关闭后清空草稿，下一次打开是一张干净的表单；常驻挂载才能让焦点归还触发按钮。
  useEffect(() => {
    if (open) return
    setName("")
    setScopes(["profile:read", "resume:read"])
    setSecret(null)
  }, [open])

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
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t("settings.patModal.title")}
      description={secret === null ? t("settings.patModal.description") : undefined}
      initialFocus={nameRef}
    >
      {secret === null ? (
        <>
          <label className="mt-4 block">
            <span className="text-xs font-medium text-muted-foreground">{t("settings.patModal.name")}</span>
            <input
              ref={nameRef}
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
            <button onClick={() => onOpenChange(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">{t("common.actions.cancel")}</button>
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
            <button onClick={() => onOpenChange(false)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{t("common.actions.done")}</button>
          </div>
        </>
      )}
    </Modal>
  )
}
