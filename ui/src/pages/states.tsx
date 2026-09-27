// 路由级加载 / 未找到状态。与 DES-012 统一状态块保持同一套视觉与文案约束。

import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { StateBlock } from "@/components/kit/state-block"

export function PageLoading({ label }: { label?: string }) {
  const { t } = useTranslation()
  return <StateBlock kind="loading" title={t("common.pageState.loading")} description={label ?? t("common.pageState.loadingDemo")} />
}

/** 未找到资源的领域类型；标题按当前语言拼接，避免调用方传入已本地化的裸字符串。 */
export type NotFoundEntity = "page" | "resume" | "template" | "jd" | "resource"

export function PageNotFound({ entity = "resource" }: { entity?: NotFoundEntity }) {
  const { t } = useTranslation()
  return (
    <StateBlock
      kind="error"
      title={t("common.pageState.notFound", { target: t("common.entities." + entity) })}
      description={t("common.pageState.notFoundDescription")}
      errorCode="404"
      action={
        <Link to="/" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          {t("common.actions.backToWorkbench")}
        </Link>
      }
    />
  )
}
