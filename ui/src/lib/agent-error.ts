// Agent 请求失败的机器错误码 → i18n 键映射（C-06）。
// 简历工作台的 run-panel 与主档的 profile-assistant 共用，禁止把服务端 message 直接展示给用户。

import { ApiRequestError } from "@/lib/api-client"

export function agentErrorKey(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === "MODEL_NOT_CONFIGURED") return "workbench.run.errors.modelNotConfigured"
    if (cause.code === "RATE_LIMITED") return "workbench.run.errors.rateLimited"
    if (cause.code === "NETWORK_ERROR") return "workbench.run.errors.network"
  }
  return "workbench.run.errors.generic"
}
