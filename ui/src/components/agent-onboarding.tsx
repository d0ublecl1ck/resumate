// Agent 能力可用性引导：模型未配置 / 运行体未接入 / 正常可用。
// 只负责呈现状态与下一步动作，不发起请求，也不接管真实页面接线。
// 品牌音量档：语法层 + mascot="badge"（AGENTS.md「页面开发」C 档）。

import { useTranslation } from "react-i18next"
import { MascotState, StampBadge, type MascotStateKind, type StampTone } from "@/components/brand"
import type { ModelConfig, RuntimeStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export type AgentAvailability = "model_missing" | "runtime_offline" | "available"
/** panel：个人资料助手抽屉正文；entry：设置页分区入口。 */
export type AgentAvailabilityPlacement = "panel" | "entry"
export type AgentAvailabilityAction = "configure_model" | "start_chat"

const KIND: Record<AgentAvailability, MascotStateKind> = {
  model_missing: "empty",
  runtime_offline: "frozen",
  available: "empty",
}

const STAMP_TONE: Record<AgentAvailability, StampTone> = {
  model_missing: "gold",
  runtime_offline: "neutral",
  available: "cobalt",
}

// 只有可被用户解除的状态才有主操作；运行体未接入不提供「假装能跑」的入口。
const ACTION: Partial<Record<AgentAvailability, AgentAvailabilityAction>> = {
  model_missing: "configure_model",
  available: "start_chat",
}

export function AgentAvailabilityNotice({
  state,
  placement = "panel",
  onAction,
  className,
}: {
  state: AgentAvailability
  placement?: AgentAvailabilityPlacement
  onAction?: (action: AgentAvailabilityAction) => void
  className?: string
}) {
  const { t } = useTranslation()
  const action = ACTION[state]

  return (
    <div className={cn("space-y-3", className)}>
      <StampBadge tone={STAMP_TONE[state]}>{t("agentOnboarding.state." + state + ".stamp")}</StampBadge>
      <MascotState
        kind={KIND[state]}
        mascot="badge"
        size={placement === "panel" ? "default" : "quiet"}
        title={t("agentOnboarding.state." + state + ".title")}
        description={t("agentOnboarding.state." + state + ".description")}
        action={
          action ? (
            <button
              type="button"
              onClick={() => onAction?.(action)}
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t("agentOnboarding.state." + state + ".action")}
            </button>
          ) : null
        }
      />
    </div>
  )
}

/**
 * 把模型凭证与运行体就绪信号合并成三态。
 * runtime 缺失（尚未探测到）按未就绪处理；available 只表示「需要时能启动」，不代表已有常驻进程。
 */
export function agentAvailabilityFromModelConfig(
  config: Pick<ModelConfig, "keyConfigured">,
  runtime?: Pick<RuntimeStatus, "available">,
): AgentAvailability {
  if (!config.keyConfigured) return "model_missing"
  return runtime?.available ? "available" : "runtime_offline"
}
