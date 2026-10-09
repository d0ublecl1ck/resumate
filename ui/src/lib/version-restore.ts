// 版本恢复的错误文案映射（C-03 / C-06）：机器错误码 → i18n 文案。
// 与 resume-lifecycle.ts 分开维护：那里是「归档简历的恢复」，这里是「恢复到历史版本」，措辞不同。
import i18n from "@/i18n"
import { ApiRequestError } from "@/lib/api-client"

export function versionRestoreErrorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "RESOURCE_NOT_FOUND") return i18n.t("resume.restore.errors.missing")
    if (cause.code === "VALIDATION_FAILED") return i18n.t("resume.restore.errors.current")
    if (cause.code === "FORBIDDEN" || cause.code === "UNAUTHENTICATED") return i18n.t("resume.restore.errors.permission")
    if (cause.code === "NETWORK_ERROR") return i18n.t("resume.restore.errors.network")
  }
  return i18n.t("resume.restore.errors.generic")
}
