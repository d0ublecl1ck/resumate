// DES-006 PendingAction 授权卡。展示确认人、目标资源、tool call、基线、
// 负载、影响与过期原因。危险操作需要文本确认，不用模糊“继续”。

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { PendingAction } from "@/lib/types"
import { DiffItemCard } from "./diff"
import { ShieldCheck } from "lucide-react"

const STATE_META: Record<PendingAction["state"], { labelKey: string; tone: string }> = {
  pending: { labelKey: "common.pendingAction.pending", tone: "text-coral" },
  approved: { labelKey: "common.pendingAction.approved", tone: "text-cobalt" },
  rejected: { labelKey: "common.pendingAction.rejected", tone: "text-muted-foreground" },
  stale: { labelKey: "common.pendingAction.stale", tone: "text-coral" },
  executing: { labelKey: "common.pendingAction.executing", tone: "text-cobalt" },
  consumed: { labelKey: "common.pendingAction.consumed", tone: "text-muted-foreground" },
}

export function PendingActionCard({
  action,
  onApprove,
  onReject,
  onDiffAccept,
  onDiffReject,
}: {
  action: PendingAction
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onDiffAccept?: (actionId: string, diffId: string) => void
  onDiffReject?: (actionId: string, diffId: string) => void
}) {
  const { t } = useTranslation()
  const [confirmText, setConfirmText] = useState("")
  const meta = STATE_META[action.state]
  const confirmWord = t("common.pendingAction.textConfirmWord")
  const confirmReady = !action.requiresTextConfirm || confirmText.trim() === confirmWord

  return (
    <div className="card-frame p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-cobalt/10 text-cobalt">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{action.title}</p>
            <p className="text-xs text-muted-foreground">{action.targetResource}</p>
          </div>
        </div>
        <span className={cn("text-xs font-semibold", meta.tone)}>{t(meta.labelKey)}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="flex gap-1.5"><dt className="text-muted-foreground">{t("common.pendingAction.toolCall")}</dt><dd className="font-mono text-foreground">{action.toolCallId}</dd></div>
        {action.baseVersionId ? <div className="flex gap-1.5"><dt className="text-muted-foreground">{t("common.pendingAction.baseVersion")}</dt><dd className="font-mono text-foreground">{action.baseVersionId}</dd></div> : null}
      </dl>

      <p className="mt-2 rounded-md bg-secondary px-2.5 py-1.5 text-xs leading-5 text-secondary-foreground">{t("common.pendingAction.impactLabel")}{action.impactSummary}</p>

      {action.staleReason ? <p className="mt-2 text-xs font-medium text-coral">{t("common.pendingAction.staleReasonLabel")}{action.staleReason}</p> : null}

      {action.diff?.length ? (
        <div className="mt-3 space-y-2">
          {action.diff.map((d) => (
            <DiffItemCard
              key={d.id}
              item={d}
              onAccept={onDiffAccept ? (id) => onDiffAccept(action.id, id) : undefined}
              onReject={onDiffReject ? (id) => onDiffReject(action.id, id) : undefined}
            />
          ))}
        </div>
      ) : null}

      {action.state === "pending" ? (
        <div className="mt-3 border-t border-border pt-3">
          {action.requiresTextConfirm ? (
            <label className="mb-2 block text-xs text-muted-foreground">
              {t("common.pendingAction.textConfirmPrompt", { word: confirmWord })}
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                placeholder={t("common.pendingAction.textConfirmPlaceholder")}
              />
            </label>
          ) : null}
          <div className="flex gap-2">
            <button
              disabled={!confirmReady}
              onClick={() => onApprove?.(action.id)}
              className="rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("common.actions.approve")}
            </button>
            <button
              onClick={() => onReject?.(action.id)}
              className="rounded-md border border-border px-3.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
            >
              {t("common.actions.reject")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
