// 新建 / 复制简历的错误文案映射（C-06）：机器错误码 → i18n 文案。
// 复制链路会因原简历被删除而 404，单独给出可理解的说明，其余沿用通用分类。
import i18n from "@/i18n"
import { ApiRequestError } from "@/lib/api-client"

export function resumeCreateErrorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "RESOURCE_NOT_FOUND") return i18n.t("resume.create.errors.sourceMissing")
    if (cause.code === "VALIDATION_FAILED") return i18n.t("resume.create.errors.validation")
    if (cause.code === "FORBIDDEN" || cause.code === "UNAUTHENTICATED") return i18n.t("resume.create.errors.permission")
    if (cause.code === "NETWORK_ERROR") return i18n.t("resume.create.errors.network")
  }
  return i18n.t("resume.create.errors.generic")
}
