// 运行失败的共享错误块（issue 4ff97）。
// 简历工作台的 RunPanel 与个人资料助手共用同一份实现，避免两套错误态：
// 类别、当前 provider/model、出问题那把 key 的已掩码尾号、上游已脱敏原文，以及
// 「去设置更新 Key」与「重试」两个出口。后端已保证 message 不含完整 key。

import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import type { RunError } from "@/lib/types"

export function RunErrorBlock({
  error,
  onRetry,
}: {
  error: RunError
  /** 重试上一次输入；没有可重试的输入时不传。 */
  onRetry?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const category = t("workbench.run.runError.category." + error.category, { defaultValue: error.category })
  const providerModel =
    error.provider || error.model
      ? t("workbench.run.runError.providerModel", { provider: error.provider ?? "-", model: error.model ?? "-" })
      : t("workbench.run.runError.providerModelUnknown")
  const keyHint = error.keyHint
    ? t("workbench.run.runError.keyHint", { keyHint: error.keyHint })
    : t("workbench.run.runError.keyHintUnknown")

  return (
    <div
      role="alert"
      data-testid="run-error"
      className="rounded-lg border border-coral/30 bg-coral/10 p-3 text-xs"
    >
      <p className="flex items-center gap-1.5 font-semibold text-coral">
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
        {t("workbench.run.runError.title", { category })}
      </p>
      <div className="mt-2 space-y-1 text-[11px] leading-5">
        <p className="wrap-anywhere text-foreground">{providerModel}</p>
        <p className="wrap-anywhere font-mono text-foreground">{keyHint}</p>
        {error.message ? (
          <p className="wrap-anywhere text-muted-foreground">{t("workbench.run.runError.message", { message: error.message })}</p>
        ) : null}
        <p className="text-muted-foreground">{t("workbench.run.runError.hint")}</p>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="xs" variant="outline" onClick={() => navigate("/settings")}>
          {t("workbench.run.runError.updateKey")}
        </Button>
        {onRetry ? (
          <Button size="xs" onClick={onRetry}>
            {t("workbench.run.runError.retry")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
