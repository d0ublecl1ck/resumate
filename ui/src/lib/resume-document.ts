// 简历文档保存的错误文案映射（C-05 / C-06）：机器错误码 → i18n 文案。
// 基线过期（BASE_VERSION_STALE）是手动编辑最常见的失败：别人先保存过，必须提示换基线重试，
// 不能把服务端原始 message 透给用户。
import i18n from "@/i18n"
import { ApiRequestError } from "@/lib/api-client"

export function documentSaveErrorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "BASE_VERSION_STALE") return i18n.t("resume.editor.saveErrors.stale")
    if (cause.code === "VALIDATION_FAILED") return i18n.t("resume.editor.saveErrors.validation")
    if (cause.code === "FORBIDDEN" || cause.code === "UNAUTHENTICATED") return i18n.t("resume.editor.saveErrors.permission")
    if (cause.code === "NETWORK_ERROR") return i18n.t("resume.editor.saveErrors.network")
  }
  return i18n.t("resume.editor.saveErrors.generic")
}
