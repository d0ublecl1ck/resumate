// DES-007 保存状态、DES-009 来源/证据、DES-011 JD 绑定状态。
// 关键约束：状态不能只靠颜色表达，必须带文本（可访问性 / 色盲）。

import { cn } from "@/lib/utils"
import type { EvidenceStatus, Provenance, SaveState } from "@/lib/types"
import { AlertTriangle, CircleCheck, CircleDashed, FileText, Link2, Lock, Snowflake, UploadCloud } from "lucide-react"

// ---------------------------------------------------------------------------
// DES-007 保存与提交状态
// ---------------------------------------------------------------------------

const SAVE_STATE_META: Record<SaveState, { label: string; tone: string; icon: React.ElementType }> = {
  local_unsynced: { label: "本地未送达", tone: "text-coral border-coral/40 bg-coral/5", icon: UploadCloud },
  synced_draft: { label: "已同步草稿", tone: "text-cobalt border-cobalt/40 bg-cobalt/5", icon: CircleDashed },
  uncommitted: { label: "未提交", tone: "text-coral border-coral/40 bg-coral/5", icon: CircleDashed },
  saving: { label: "保存中", tone: "text-cobalt border-cobalt/40 bg-cobalt/5", icon: CircleDashed },
  committed: { label: "已保存版本", tone: "text-foreground border-foreground/25 bg-secondary", icon: CircleCheck },
  failed: { label: "保存失败", tone: "text-coral border-coral bg-coral/10", icon: AlertTriangle },
  frozen: { label: "草稿冻结", tone: "text-muted-foreground border-border bg-muted", icon: Snowflake },
}

export function SaveStateBadge({ state, detail, className }: { state: SaveState; detail?: string; className?: string }) {
  const meta = SAVE_STATE_META[state]
  const Icon = meta.icon
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", meta.tone, className)}
      title={detail}
    >
      <Icon className="size-3.5" aria-hidden />
      {meta.label}
      {detail ? <span className="text-muted-foreground">· {detail}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// DES-009 来源与证据徽标
// ---------------------------------------------------------------------------

const PROVENANCE_LABEL: Record<Provenance["kind"], { label: string; icon: React.ElementType }> = {
  profile_fact: { label: "Profile 事实", icon: FileText },
  user_input: { label: "用户输入", icon: FileText },
  jd_snapshot: { label: "JD 快照", icon: Link2 },
  agent_generated: { label: "Agent 生成", icon: CircleDashed },
  template: { label: "模板", icon: FileText },
  external_client: { label: "外部客户端", icon: Link2 },
}

export function SourceBadge({ provenance, className }: { provenance: Provenance; className?: string }) {
  const meta = PROVENANCE_LABEL[provenance.kind]
  const Icon = meta.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground", className)}>
      <Icon className="size-3" aria-hidden />
      {provenance.label || meta.label}
      {provenance.detail ? <span className="text-muted-foreground">· {provenance.detail}</span> : null}
    </span>
  )
}

const EVIDENCE_META: Record<EvidenceStatus, { label: string; tone: string; icon: React.ElementType }> = {
  verified: { label: "已核实", tone: "text-cobalt border-cobalt/40 bg-cobalt/5", icon: CircleCheck },
  unverified: { label: "待核实", tone: "text-coral border-coral/40 bg-coral/5", icon: AlertTriangle },
  no_evidence: { label: "无证据", tone: "text-muted-foreground border-border bg-muted", icon: CircleDashed },
}

export function EvidenceBadge({ status, label, className }: { status: EvidenceStatus; label?: string; className?: string }) {
  const meta = EVIDENCE_META[status]
  const Icon = meta.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium", meta.tone, className)}>
      <Icon className="size-3" aria-hidden />
      {meta.label}
      {label ? <span className="opacity-70">· {label}</span> : null}
    </span>
  )
}

// ---------------------------------------------------------------------------
// DES-011 JD 绑定状态
// ---------------------------------------------------------------------------

type BindingKind = "unbound" | "bound" | "reselected" | "copy_target" | "unavailable" | "released" | "snapshot"

const BINDING_META: Record<BindingKind, { label: string; tone: string }> = {
  unbound: { label: "未绑定", tone: "text-muted-foreground border-border bg-muted" },
  bound: { label: "当前绑定", tone: "text-cobalt border-cobalt/40 bg-cobalt/5" },
  reselected: { label: "本次改选", tone: "text-foreground border-gold/70 bg-gold/20" },
  copy_target: { label: "复制目标", tone: "text-foreground border-gold/70 bg-gold/20" },
  unavailable: { label: "绑定不可用", tone: "text-coral border-coral bg-coral/10" },
  released: { label: "已解绑", tone: "text-muted-foreground border-border bg-muted" },
  snapshot: { label: "历史快照", tone: "text-foreground border-foreground/25 bg-secondary" },
}

export function JdBindingBadge({ kind, resumeTitle, className }: { kind: BindingKind; resumeTitle?: string; className?: string }) {
  const meta = BINDING_META[kind]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium", meta.tone, className)}>
      {kind === "unavailable" ? <AlertTriangle className="size-3" aria-hidden /> : kind === "bound" ? <Lock className="size-3" aria-hidden /> : null}
      {meta.label}
      {resumeTitle ? <span className="opacity-80">· {resumeTitle}</span> : null}
    </span>
  )
}
