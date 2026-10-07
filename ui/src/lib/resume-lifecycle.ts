// 归档 / 恢复的错误文案映射（C-06）：机器错误码 → i18n 文案。
// 与 resume-create.ts 分开维护：按钮语义不同，复用创建流程的措辞会把归档失败说成「创建失败」。
import i18n from "@/i18n"
import { ApiRequestError } from "@/lib/api-client"

export type ResumeLifecycleAction = "archive" | "restore"

export function resumeLifecycleErrorMessage(cause: unknown, action: ResumeLifecycleAction): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "RESOURCE_NOT_FOUND") return i18n.t("resume.library.errors.missing")
    if (cause.code === "FORBIDDEN" || cause.code === "UNAUTHENTICATED") return i18n.t("resume.library.errors.permission")
    if (cause.code === "NETWORK_ERROR") return i18n.t("resume.library.errors.network")
  }
  return action === "archive" ? i18n.t("resume.library.errors.archiveFailed") : i18n.t("resume.library.errors.restoreFailed")
}
