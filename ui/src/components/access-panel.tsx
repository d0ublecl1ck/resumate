// SCR-011 开放接入与访问审计 + SCR-111 PAT 创建/撤销 Modal。
// 凭证仅创建成功时显示一次（BR-D17）；撤销后冻结未提交草稿并禁止读取幂等结果。

import { useState } from "react"
import type { AccessLogEntry, CapabilityDiscovery, PersonalAccessToken } from "@/lib/types"
import { cn } from "@/lib/utils"
import { Ban, Copy, KeyRound, Plus, ShieldCheck, X } from "lucide-react"

const PAT_STATUS: Record<PersonalAccessToken["status"], { label: string; tone: string }> = {
  active: { label: "有效", tone: "text-cobalt border-cobalt/40 bg-cobalt/5" },
  expiring: { label: "即将到期", tone: "text-foreground border-gold/70 bg-gold/20" },
  revoked: { label: "已撤销", tone: "text-muted-foreground border-border bg-muted" },
}

const RESULT_META: Record<AccessLogEntry["result"], { label: string; tone: string }> = {
  allowed: { label: "允许", tone: "text-cobalt" },
  denied: { label: "拒绝", tone: "text-coral" },
  frozen: { label: "冻结", tone: "text-muted-foreground" },
}

export function AccessPanel({ pats, logs, capability }: { pats: PersonalAccessToken[]; logs: AccessLogEntry[]; capability: CapabilityDiscovery }) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-6">
      {/* 能力发现 */}
      <section className="card-soft p-5">
        <h2 className="text-sm font-bold text-foreground">公共接入能力</h2>
        <p className="mt-1 text-xs text-muted-foreground">契约版本 {capability.contractVersion} · 认证方式 {capability.authMethods.join("、")}</p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <CopyField label="能力发现" value={capability.wellKnownUrl} />
          <CopyField label="OpenAPI" value={capability.openapiUrl} />
          <CopyField label="MCP" value={capability.mcpUrl} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {capability.capabilities.map((c) => (
            <span key={c} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground">{c}</span>
          ))}
        </div>
      </section>

      {/* PAT 列表 */}
      <section className="card-soft p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">个人访问令牌（PAT）</h2>
          <button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" aria-hidden /> 创建最小权限 Token
          </button>
        </div>
        <ul className="space-y-3">
          {pats.map((p) => (
            <li key={p.id} className={cn("rounded-lg border p-3", p.status === "revoked" ? "border-border bg-muted/40 opacity-70" : "border-border")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><KeyRound className="size-3.5 text-cobalt" aria-hidden /> {p.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.purpose}</p>
                </div>
                <span className={cn("rounded-md border px-2 py-0.5 text-[11px] font-medium", PAT_STATUS[p.status].tone)}>{PAT_STATUS[p.status].label}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.scopes.map((s) => (
                  <span key={s} className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground">{s}</span>
                ))}
                {p.fields.map((f) => (
                  <span key={f} className="rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">{f}</span>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                资源：{p.resources.join("、")} · 到期 {p.expiresAt.slice(0, 10)}
                {p.lastUsedAt ? ` · 上次使用 ${p.lastUsedAt.slice(0, 10)}` : " · 从未使用"}
              </p>
              {p.status !== "revoked" ? (
                <button className="mt-2 inline-flex items-center gap-1 rounded-md border border-coral/40 px-2.5 py-1 text-xs font-medium text-coral hover:bg-coral/5">
                  <Ban className="size-3.5" aria-hidden /> 撤销
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {/* 访问日志 */}
      <section className="card-soft p-5">
        <h2 className="mb-3 text-sm font-bold text-foreground">访问审计日志</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">时间</th>
                <th className="py-2 pr-4 font-medium">客户端</th>
                <th className="py-2 pr-4 font-medium">Scope</th>
                <th className="py-2 pr-4 font-medium">资源</th>
                <th className="py-2 pr-4 font-medium">用途</th>
                <th className="py-2 font-medium">结果</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border/60">
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{l.at.slice(5, 16).replace("T", " ")}</td>
                  <td className="py-2 pr-4">{l.clientId}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{l.scope}</td>
                  <td className="py-2 pr-4 text-xs">{l.resource}</td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{l.purpose}</td>
                  <td className="py-2">
                    <span className={cn("text-xs font-semibold", RESULT_META[l.result].tone)}>{RESULT_META[l.result].label}</span>
                    {l.errorCode ? <span className="ml-1 font-mono text-[10px] text-muted-foreground">{l.errorCode}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {createOpen ? <PatModal onClose={() => setCreateOpen(false)} /> : null}
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

function PatModal({ onClose }: { onClose: () => void }) {
  const [created, setCreated] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-foreground/40" aria-label="关闭" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="pat-title" className="relative z-10 w-full max-w-md card-frame p-6">
        <div className="flex items-start justify-between">
          <h2 id="pat-title" className="font-serif text-xl font-bold text-foreground">创建访问令牌</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary" aria-label="关闭"><X className="size-5" /></button>
        </div>

        {!created ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">选择最小必要权限。Token 不会获得未勾选的 Scope，也不会隐式获得 JD 管理权限。</p>
            <div className="mt-4 space-y-2">
              {["profile:read", "resume:read", "resume:write", "jd:read", "jd:write"].map((s, i) => (
                <label key={s} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <input type="checkbox" defaultChecked={i < 2} /> <span className="font-mono text-xs">{s}</span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">取消</button>
              <button onClick={() => setCreated(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">创建</button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-cobalt/40 bg-cobalt/5 p-3 text-sm text-foreground">
              <ShieldCheck className="size-4 shrink-0 text-cobalt" aria-hidden />
              凭证只显示这一次，请立即复制并妥善保存。
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">rsm_pat_8f2c...a91d（一次性）</code>
              <button className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"><Copy className="size-3.5" aria-hidden /> 复制</button>
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">完成</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
