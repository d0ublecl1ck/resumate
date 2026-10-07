// Agent 能力可用性引导：加载中 / 读取失败（可重试）/ 无权限 / 模型未配置 / 运行体未接入 / 正常可用。
// 只负责呈现状态与下一步动作，不发起请求，也不接管真实页面接线。
// 品牌音量档：语法层 + mascot="badge"（AGENTS.md「页面开发」C 档）。

import { useTranslation } from "react-i18next"
import { MascotState, StampBadge, type MascotStateKind, type StampTone } from "@/components/brand"
import type { ModelConfig, RuntimeStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export type AgentAvailability = "checking" | "load_failed" | "forbidden" | "model_missing" | "runtime_offline" | "available"
/** panel：个人资料助手抽屉正文；entry：设置页分区入口。 */
export type AgentAvailabilityPlacement = "panel" | "entry"
export type AgentAvailabilityAction = "configure_model" | "start_chat" | "retry"

const KIND: Record<AgentAvailability, MascotStateKind> = {
  checking: "loading",
  load_failed: "error",
  forbidden: "forbidden",
  model_missing: "empty",
  runtime_offline: "frozen",
  available: "empty",
}

const STAMP_TONE: Record<AgentAvailability, StampTone> = {
  checking: "neutral",
  load_failed: "coral",
  forbidden: "neutral",
  model_missing: "gold",
  runtime_offline: "neutral",
  available: "cobalt",
}

// 只有可被用户解除的状态才有主操作；无权限与运行体未接入不给「假装能跑」的入口。
// 读取失败可以重试；无权限重试也没有意义，因此不提供按钮。
const ACTION: Partial<Record<AgentAvailability, AgentAvailabilityAction>> = {
  load_failed: "retry",
  model_missing: "configure_model",
  available: "start_chat",
}

/** 无权限类机器错误码：读到它们说明是权限问题，而不是「没配模型」。 */
const FORBIDDEN_CODES: ReadonlySet<string> = new Set([
  "FORBIDDEN",
  "SCOPE_INSUFFICIENT",
  "ACCOUNT_BANNED",
  "UNAUTHENTICATED",
  "TOKEN_REVOKED",
])

export interface AgentAvailabilitySignals {
  /** errorCode 来自查询错误或后端机器错误码，这里只按字符串集合判定权限，不做窄化。 */
  model: { isPending: boolean; keyConfigured?: boolean; errorCode?: string | null }
  runtime: { isPending: boolean; available?: boolean }
}

/**
 * 把模型配置查询与运行体探测两路信号合并成六态。
 *
 * - 任一查询仍在加载 -> checking，不提前下结论；
 * - 模型配置读取失败 -> 按错误码区分 load_failed / forbidden，两者都不得当成「没配模型」；
 * - 数据到手但未配置密钥 -> model_missing，与运行体是否就绪无关；
 * - 已配置但运行体起不来 -> runtime_offline；
 * - 都能用 -> available（只表示「需要时能启动」，不代表已有常驻进程）。
 */
export function agentAvailability({ model, runtime }: AgentAvailabilitySignals): AgentAvailability {
  if (model.isPending || runtime.isPending) return "checking"
  if (model.errorCode) return FORBIDDEN_CODES.has(model.errorCode) ? "forbidden" : "load_failed"
  if (!model.keyConfigured) return "model_missing"
  return runtime.available ? "available" : "runtime_offline"
}

/**
 * 兼容入口：调用方已经确认拿到模型配置数据（如设置页在渲染前已过滤掉查询失败）时使用。
 */
export function agentAvailabilityFromModelConfig(
  config: Pick<ModelConfig, "keyConfigured">,
  runtime?: Pick<RuntimeStatus, "available">,
): AgentAvailability {
  return agentAvailability({
    model: { isPending: false, keyConfigured: config.keyConfigured },
    runtime: { isPending: false, available: runtime?.available },
  })
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
