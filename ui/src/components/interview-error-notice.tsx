// 面试相关屏幕共享的失败出口：标题 + 中文说明；MODEL_NOT_CONFIGURED 额外给出「去设置模型」引导。
// 放在 components 共享层，避免 features -> pages 的反向依赖（voice/session 屏不再 import @/pages/interview）。
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Settings } from "lucide-react"

import { userFacingError } from "@/lib/api-error-text"

/** 把机器错误码映射到本命名空间的 i18n 文案；未知码回落到 generic，绝不泄漏后端英文原文。 */
function errorText(
  cause: unknown,
  t: (key: string, options?: { defaultValue?: string }) => string,
): string {
  const fallback = t("interviewWorkflow.errors.generic")
  const { code } = userFacingError(cause, fallback)
  if (!code) return fallback
  return t(`interviewWorkflow.errors.${code}`, { defaultValue: "" }) || fallback
}

/** 统一失败出口：标题 + 中文说明；MODEL_NOT_CONFIGURED 额外给出「去设置模型」引导。 */
export function InterviewErrorNotice({ title, cause }: { title: string; cause: unknown }) {
  const { t } = useTranslation()
  const { code } = userFacingError(cause, t("interviewWorkflow.errors.generic"))
  return (
    <div role="alert" className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3">
      <p className="text-sm font-medium text-coral">{title}</p>
      <p className="mt-1 text-sm text-secondary-foreground">{errorText(cause, t)}</p>
      {code === "MODEL_NOT_CONFIGURED" ? (
        <Link
          to="/settings"
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
        >
          <Settings className="size-3.5" aria-hidden />
          {t("interviewWorkflow.errors.openSettings")}
        </Link>
      ) : null}
    </div>
  )
}
