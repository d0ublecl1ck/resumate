// Agent 能力可用性引导：加载中 / 读取失败（可重试）/ 无权限 / 模型未配置 / 凭据被拒 / 运行体未接入 / 正常可用。
// 只负责呈现状态与下一步动作，不发起请求，也不接管真实页面接线。
// 品牌音量档：语法层 + mascot="badge"（AGENTS.md「页面开发」C 档）。

import { useTranslation } from "react-i18next"
import { MascotState, StampBadge, type MascotStateKind, type StampTone } from "@/components/brand"
import type { ModelConfig, ModelTestResult, RuntimeStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export type AgentAvailability = "checking" | "load_failed" | "forbidden" | "model_missing" | "auth_failed" | "runtime_offline" | "available"
/** panel：个人资料助手抽屉 / 简历编辑器对话区正文；entry：设置页分区入口。 */
export type AgentAvailabilityPlacement = "panel" | "entry"
export type AgentAvailabilityAction = "configure_model" | "start_chat" | "retry"
/** 动作归一后的效果：调用方只按效果执行，不再各自解析 action（否则会再次分叉）。 */
export type AgentAvailabilityActionEffect = "settings" | "chat" | "retry" | "stay"

/**
 * 把可用性引导动作归一成调用方要执行的效果。
 * - start_chat -> chat：进入对话；调用方已经在对话里时聚焦自己的输入框即可；
 * - configure_model -> settings：去模型配置（「没配」与「配了但被拒」共用这个效果）；
 * - retry -> retry：重试可用性查询；
 * - 未知动作（上游新增）-> stay：留在当前页，绝不误触发导航。
 */
export function agentAvailabilityActionEffect(action: AgentAvailabilityAction): AgentAvailabilityActionEffect {
  switch (action) {
    case "start_chat":
      return "chat"
    case "configure_model":
      return "settings"
    case "retry":
      return "retry"
    default:
      return "stay"
  }
}

const KIND: Record<AgentAvailability, MascotStateKind> = {
  checking: "loading",
  load_failed: "error",
  forbidden: "forbidden",
  model_missing: "empty",
  // 凭据被拒是用户必须处理的错误：coral 标题 + alert 播报（六态语义不退化）。
  auth_failed: "error",
  runtime_offline: "frozen",
  available: "empty",
}

const STAMP_TONE: Record<AgentAvailability, StampTone> = {
  checking: "neutral",
  load_failed: "coral",
  forbidden: "neutral",
  model_missing: "gold",
  auth_failed: "coral",
  runtime_offline: "neutral",
  available: "cobalt",
}

// 只有可被用户解除的状态才有主操作；无权限与运行体未接入不给「假装能跑」的入口。
// 读取失败可以重试；无权限重试也没有意义，因此不提供按钮。
// auth_failed 与 model_missing 共用 configure_model：两者去向相同（设置页模型配置），
// 只是文案不同——前者是「更新 Key」，后者是「去配置」。
const ACTION: Partial<Record<AgentAvailability, AgentAvailabilityAction>> = {
  load_failed: "retry",
  model_missing: "configure_model",
  auth_failed: "configure_model",
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

/**
 * 上游拒绝凭据的机器错误码；与后端运行失败分类同源
 * （backend/app/modules/agent/run_errors.py 的 _AUTH_CODES）。
 * 这类状态是「配了 key 但被上游拒绝」，必须与「没配 key」区分开。
 */
const CREDENTIAL_REJECTED_CODES: ReadonlySet<string> = new Set([
  "MODEL_AUTH",
  "MODEL_AUTH_FAILED",
  "UNAUTHORIZED",
  "INVALID_API_KEY",
])

/** 上游拒绝凭据的文案特征，取后端 _AUTH_PATTERNS 的子集（401 / 403 / unauthorized / api key ... invalid）。 */
const CREDENTIAL_REJECTION = /\b40[13]\b|authentication fails|unauthori[sz]ed|api key[^.]*invalid|invalid api key/i

/** 唯一允许透出的凭证形式：上游已掩码的尾号。与后端 run_errors.py 的 _MASKED_HINT 同构。 */
const MASKED_CREDENTIAL = /\*{2,}[A-Za-z0-9._-]{2,12}/

/**
 * 从上游文案里取回已掩码的凭据尾号（例如 ****be21）。
 * 只认掩码形态：调用方误传完整明文 key 时返回 null，界面绝不把明文打到页面上。
 */
export function maskedCredentialTail(hint?: string | null): string | null {
  if (!hint) return null
  const match = hint.match(MASKED_CREDENTIAL)
  return match ? match[0] : null
}

/** 上次连通性测试是否因凭据被拒而失败（测试通过或非凭据原因都不算）。 */
function credentialRejected(test?: Pick<ModelTestResult, "ok" | "message"> | null): boolean {
  if (!test || test.ok) return false
  return CREDENTIAL_REJECTION.test(test.message ?? "")
}

export interface AgentAvailabilitySignals {
  /** errorCode 来自查询错误或后端机器错误码，这里只按字符串集合判定权限与凭据，不做窄化。 */
  model: {
    isPending: boolean
    keyConfigured?: boolean
    errorCode?: string | null
    /** 设置页最近一次连通性测试结果：配置读得到、但凭据被上游拒绝时用于判 auth_failed。 */
    lastTest?: Pick<ModelTestResult, "ok" | "message"> | null
  }
  runtime: { isPending: boolean; available?: boolean }
}

/**
 * 把模型配置查询与运行体探测两路信号合并成七态。
 *
 * - 任一查询仍在加载 -> checking，不提前下结论；
 * - 模型配置读取失败 -> 按错误码区分 load_failed / forbidden / auth_failed，都不得当成「没配模型」；
 * - 数据到手但未配置密钥 -> model_missing，与运行体是否就绪无关；
 * - 已配置但凭据被上游拒绝 -> auth_failed，绝不能当成 available；
 * - 已配置但运行体起不来 -> runtime_offline；
 * - 都能用 -> available（只表示「需要时能启动」，不代表已有常驻进程）。
 */
export function agentAvailability({ model, runtime }: AgentAvailabilitySignals): AgentAvailability {
  if (model.isPending || runtime.isPending) return "checking"
  if (model.errorCode) {
    if (FORBIDDEN_CODES.has(model.errorCode)) return "forbidden"
    if (CREDENTIAL_REJECTED_CODES.has(model.errorCode)) return "auth_failed"
    return "load_failed"
  }
  if (!model.keyConfigured) return "model_missing"
  if (credentialRejected(model.lastTest)) return "auth_failed"
  return runtime.available ? "available" : "runtime_offline"
}

/**
 * 兼容入口：调用方已经确认拿到模型配置数据（如设置页在渲染前已过滤掉查询失败）时使用。
 */
export function agentAvailabilityFromModelConfig(
  config: Pick<ModelConfig, "keyConfigured" | "lastTest">,
  runtime?: Pick<RuntimeStatus, "available">,
): AgentAvailability {
  return agentAvailability({
    model: { isPending: false, keyConfigured: config.keyConfigured, lastTest: config.lastTest },
    runtime: { isPending: false, available: runtime?.available },
  })
}

export function AgentAvailabilityNotice({
  state,
  placement = "panel",
  credentialHint,
  onAction,
  className,
}: {
  state: AgentAvailability
  placement?: AgentAvailabilityPlacement
  /** 被上游拒绝的凭据线索；只有形如 ****be21 的掩码会被渲染，其余一律丢弃。 */
  credentialHint?: string | null
  onAction?: (action: AgentAvailabilityAction) => void
  className?: string
}) {
  const { t } = useTranslation()
  const action = ACTION[state]
  // 只在凭据被拒这一态展示尾号；未掩码的明文经 maskedCredentialTail 过滤成 null。
  const credentialTail = state === "auth_failed" ? maskedCredentialTail(credentialHint) : null

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
      {credentialTail ? (
        <p className={cn("text-xs font-medium text-muted-foreground", placement === "panel" && "text-center")}>
          {t("agentOnboarding.state.auth_failed.credentialHint", { credential: credentialTail })}
        </p>
      ) : null}
    </div>
  )
}
