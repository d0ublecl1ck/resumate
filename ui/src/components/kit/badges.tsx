// DES-007 保存状态、DES-009 来源/证据、DES-011 JD 绑定状态。
// 关键约束：状态不能只靠颜色表达，必须带文本（可访问性 / 色盲）。

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { EvidenceStatus, Provenance, SaveState } from "@/lib/types"
import { AlertTriangle, CircleCheck, CircleDashed, FileText, Link2, Lock, Snowflake, UploadCloud } from "lucide-react"

// ---------------------------------------------------------------------------
// DES-007 保存与提交状态
// ---------------------------------------------------------------------------

const SAVE_STATE_META: Record<SaveState, { labelKey: string; tone: string; icon: React.ElementType }> = {
  local_unsynced: { labelKey: "common.saveState.local_unsynced", tone: "text-coral border-coral/40 bg-coral/5", icon: UploadCloud },
  synced_draft: { labelKey: "common.saveState.synced_draft", tone: "text-cobalt border-cobalt/40 bg-cobalt/5", icon: CircleDashed },
  uncommitted: { labelKey: "common.saveState.uncommitted", tone: "text-coral border-coral/40 bg-coral/5", icon: CircleDashed },
  saving: { labelKey: "common.saveState.saving", tone: "text-cobalt border-cobalt/40 bg-cobalt/5", icon: CircleDashed },
  committed: { labelKey: "common.saveState.committed", tone: "text-foreground border-foreground/25 bg-secondary", icon: CircleCheck },
  failed: { labelKey: "common.saveState.failed", tone: "text-coral border-coral bg-coral/10", icon: AlertTriangle },
  frozen: { labelKey: "common.saveState.frozen", tone: "text-muted-foreground border-border bg-muted", icon: Snowflake },
}

export function SaveStateBadge({ state, detail, className }: { state: SaveState; detail?: string; className?: string }) {
  const { t } = useTranslation()
  const meta = SAVE_STATE_META[state]
  const Icon = meta.icon
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", meta.tone, className)}
      title={detail}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(meta.labelKey)}
      {detail ? <span className="text-muted-foreground">· {detail}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// DES-009 来源与证据徽标
// ---------------------------------------------------------------------------

const PROVENANCE_META: Record<Provenance["kind"], { labelKey: string; icon: React.ElementType }> = {
  profile_fact: { labelKey: "common.provenance.profile_fact", icon: FileText },
  user_input: { labelKey: "common.provenance.user_input", icon: FileText },
  jd_snapshot: { labelKey: "common.provenance.jd_snapshot", icon: Link2 },
  agent_generated: { labelKey: "common.provenance.agent_generated", icon: CircleDashed },
  template: { labelKey: "common.provenance.template", icon: FileText },
  external_client: { labelKey: "common.provenance.external_client", icon: Link2 },
}

export function SourceBadge({ provenance, className }: { provenance: Provenance; className?: string }) {
  const { t } = useTranslation()
  const meta = PROVENANCE_META[provenance.kind]
  const Icon = meta.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground", className)}>
      <Icon className="size-3" aria-hidden />
      {provenance.label || t(meta.labelKey)}
      {provenance.detail ? <span className="text-muted-foreground">· {provenance.detail}</span> : null}
    </span>
  )
}

const EVIDENCE_META: Record<EvidenceStatus, { labelKey: string; tone: string; icon: React.ElementType }> = {
  verified: { labelKey: "common.evidence.verified", tone: "text-cobalt border-cobalt/40 bg-cobalt/5", icon: CircleCheck },
  unverified: { labelKey: "common.evidence.unverified", tone: "text-coral border-coral/40 bg-coral/5", icon: AlertTriangle },
  no_evidence: { labelKey: "common.evidence.no_evidence", tone: "text-muted-foreground border-border bg-muted", icon: CircleDashed },
}

export function EvidenceBadge({ status, label, className }: { status: EvidenceStatus; label?: string; className?: string }) {
  const { t } = useTranslation()
  const meta = EVIDENCE_META[status]
  const Icon = meta.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium", meta.tone, className)}>
      <Icon className="size-3" aria-hidden />
      {t(meta.labelKey)}
      {label ? <span className="opacity-70">· {label}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// DES-011 JD 绑定状态
// ---------------------------------------------------------------------------

type BindingKind = "unbound" | "bound" | "reselected" | "copy_target" | "unavailable" | "released" | "snapshot"

const BINDING_META: Record<BindingKind, { labelKey: string; tone: string }> = {
  unbound: { labelKey: "common.binding.unbound", tone: "text-muted-foreground border-border bg-muted" },
  bound: { labelKey: "common.binding.bound", tone: "text-cobalt border-cobalt/40 bg-cobalt/5" },
  reselected: { labelKey: "common.binding.reselected", tone: "text-foreground border-gold/70 bg-gold/20" },
  copy_target: { labelKey: "common.binding.copy_target", tone: "text-foreground border-gold/70 bg-gold/20" },
  unavailable: { labelKey: "common.binding.unavailable", tone: "text-coral border-coral bg-coral/10" },
  released: { labelKey: "common.binding.released", tone: "text-muted-foreground border-border bg-muted" },
  snapshot: { labelKey: "common.binding.snapshot", tone: "text-foreground border-foreground/25 bg-secondary" },
}

export function JdBindingBadge({ kind, resumeTitle, className }: { kind: BindingKind; resumeTitle?: string; className?: string }) {
  const { t } = useTranslation()
  const meta = BINDING_META[kind]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium", meta.tone, className)}>
      {kind === "unavailable" ? <AlertTriangle className="size-3" aria-hidden /> : kind === "bound" ? <Lock className="size-3" aria-hidden /> : null}
      {t(meta.labelKey)}
      {resumeTitle ? <span className="opacity-80">· {resumeTitle}</span> : null}
    </span>
  )
}
