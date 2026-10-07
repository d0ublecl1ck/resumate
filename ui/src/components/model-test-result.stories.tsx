// SCR-010 模型配置「测试连接」结果行的状态确认稿（a2cfa）。
// 真实 ui/src/components/settings-form.tsx 本轮不动：本文件用与实现相同的 Tailwind 令牌与
// lucide 图标把四种状态摆出来，供用户在 Storybook 里确认视觉与文案后再进入真实开发。
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Screen } from "@/storybook/screen"

// 后端返回的原文（业务失败 message 与持久化的上次测试 message），属后端数据不翻译（US-13.4）。
const BUSINESS_FAILURE_MESSAGE = "模型服务超时，请稍后重试" // i18n-allow: 后端业务失败原文
const PERSISTED_MESSAGE = "连接成功，延迟 420ms" // i18n-allow: 后端上次测试结果原文
// 持久化结果的时间戳按实现约定取 ISO 前 16 位（YYYY-MM-DD HH:mm）。
const PERSISTED_AT = "2026-09-19 20:00"

type RowState = "testing" | "transport" | "business" | "persisted"

/** 结果行本身：四种状态互斥，同一时刻只渲染其中一条。 */
function TestResultRow({ state }: { state: RowState }) {
  const { t } = useTranslation()
  if (state === "testing") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <RefreshCw className="size-3.5 animate-spin" aria-hidden /> {t("settings.model.testing")}
      </span>
    )
  }
  if (state === "transport") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-coral">
        <AlertTriangle className="size-3.5" aria-hidden /> {t("settings.model.testFailed")}
      </span>
    )
  }
  if (state === "business") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-coral">
        <AlertTriangle className="size-3.5" aria-hidden /> {BUSINESS_FAILURE_MESSAGE}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-cobalt">
      <CheckCircle2 className="size-3.5" aria-hidden /> {PERSISTED_MESSAGE}
      <span className="text-muted-foreground">· {t("settings.model.lastTest", { time: PERSISTED_AT })}</span>
    </span>
  )
}

/** 模型配置卡片里「保存 / 测试连接 / 结果行」这一段的最小复刻。 */
function ModelCardPreview({ state, label }: { state: RowState; label: string }) {
  const { t } = useTranslation()
  return (
    <section className="card-soft p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-60">
          {t("settings.model.save")}
        </button>
        <button
          type="button"
          disabled={state === "testing"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground disabled:opacity-60"
        >
          <RefreshCw className={cn("size-4", state === "testing" && "animate-spin")} aria-hidden /> {t("settings.model.test")}
        </button>
        <TestResultRow state={state} />
      </div>
    </section>
  )
}

function Gallery() {
  return (
    <div className="grid gap-4">
      <ModelCardPreview label="Testing" state="testing" />
      <ModelCardPreview label="Transport failure" state="transport" />
      <ModelCardPreview label="Business failure (backend message)" state="business" />
      <ModelCardPreview label="Persisted last test (not this session)" state="persisted" />
    </div>
  )
}

export default {
  title: "Components/SettingsModelTestResult",
  parameters: { layout: "fullscreen" },
}

/** 四种状态一起看：每张卡片复刻模型配置卡片里结果行那一段。 */
export const AllStates = { render: () => (<Screen path="/settings"><Gallery /></Screen>) }

/** 测试中：按钮禁用、图标转动并显示测试中提示。 */
export const Testing = { render: () => (<Screen path="/settings"><ModelCardPreview label="Testing" state="testing" /></Screen>) }

/** 传输失败：请求没拿到业务结果，只显示测试失败。 */
export const TransportFailure = { render: () => (<Screen path="/settings"><ModelCardPreview label="Transport failure" state="transport" /></Screen>) }

/** 业务失败：后端 ok=false，直接显示后端返回的 message。 */
export const BusinessFailure = { render: () => (<Screen path="/settings"><ModelCardPreview label="Business failure (backend message)" state="business" /></Screen>) }

/** 持久化的上次结果（非本次测试）：结果后面补「上次测试：<时间>」。 */
export const PersistedLastTest = { render: () => (<Screen path="/settings"><ModelCardPreview label="Persisted last test (not this session)" state="persisted" /></Screen>) }
