// 邮箱验证重发状态机（d7b99）：调用 /auth/verification/resend，维护 60s 冷却与错误文案。
// 页面（注册成功 / 登录被拒 / 失效链接）与 Storybook 共用同一份真实实现，不保留演示分支。
// 状态机本身已抽到 lib/resend.ts 与忘记密码共用（b5586），这里只提供验证邮件的命名与错误映射。

import { resendVerification } from "@/lib/api"
import { authMachineErrorMessage, RESEND_COOLDOWN_SECONDS, useResendMachine, type ResendState, type ResendStatus } from "@/lib/resend"

export { RESEND_COOLDOWN_SECONDS }
export type { ResendState, ResendStatus }

/** 把重发失败映射到 i18n 文案，绝不直出后端英文 message。 */
export const verificationErrorMessage = authMachineErrorMessage

export function useVerificationResend() {
  return useResendMachine(resendVerification, verificationErrorMessage)
}
