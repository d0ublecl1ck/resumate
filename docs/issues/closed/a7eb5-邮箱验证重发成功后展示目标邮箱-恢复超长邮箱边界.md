---
id: a7eb5
status: closed
created_at: 2026-09-28T04:00:26.626Z
updated_at: 2026-09-28T04:02:12.117Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-09-28T04:00:55.887Z
closed_at: 2026-09-28T04:02:12.117Z
---

# 邮箱验证重发成功后展示目标邮箱（恢复超长邮箱边界）

## Background

d7b99 把失效链接页的重新发送改成按 token 直发后，去掉了邮箱输入框，随之删掉了 `verify-long-email` 超长邮箱视觉边界。用户要求补回该边界：重发成功后明确告诉用户邮件发到了哪个地址。

后端 `POST /auth/verification/resend` 的 202 响应本来就带 `email` 字段，前端 `useVerificationResend` 目前把它丢掉了，界面只显示通用「验证邮件已重新发送，请查收。」。

## Scope

- `ui/src/lib/verification.ts`：`ResendState` 增加发送目标邮箱，重发成功时记录 202 响应里的 `email`。
- `ui/src/i18n/locales/{zh-CN,en}/auth.ts`：重发成功提示改为携带邮箱的文案键，zh-CN 与 en 键结构一致。
- `ui/src/components/register-verification.tsx`、`verify-email-result.tsx`、`login-verification-notice.tsx`：重发成功态展示「已发送到 <email>」，长地址折行不溢出卡片。
- Storybook：恢复超长邮箱边界 story，并让既有重发成功 story 展示目标邮箱。

## Non-goals

- 不恢复邮箱输入框，失效链接页仍按 token 重发。
- 不改后端契约与发信逻辑。
- 不改重发冷却 60s 与限流行为。

## Acceptance Criteria

- [x] 重发成功后界面显示邮件实际发送到的邮箱地址。
- [x] 超长邮箱地址在卡片内折行、不溢出。
- [x] zh-CN 与 en 文案键结构一致，无硬编码文案。
- [x] Storybook 含展示目标邮箱的重发成功态与超长邮箱态。
- [x] `pnpm -C ui test`、`pnpm -C ui build-storybook`、`archkit inspect .` 通过。

## Implementation

- `ui/src/lib/verification.ts`：`ResendState` 增加 `sentEmail`，重发成功时记录 202 响应里的 `email`。
- `ui/src/i18n/locales/{zh-CN,en}/auth.ts`：`resendSent` 改为带 `{{email}}` 的 `resendSentTo`，两语言键结构一致。
- `ui/src/components/register-verification.tsx`、`verify-email-result.tsx`、`login-verification-notice.tsx`：重发成功态显示目标邮箱，并加 `break-all` 折行。
- `ui/src/components/email-verification.stories.tsx`：新增 `RegisterResendLongEmail`；既有重发成功 story 自动展示目标邮箱。
- 测试：`email-verification.stories.test.tsx` 新增长邮箱展示断言；三处旧文案断言更新为带邮箱版本。

## Verification

- `pnpm -C ui test` → `14 files / 94 passed`（先加断言失败，再实现转绿）。
- `ui/node_modules/.bin/tsc -b` → exit 0。
- `pnpm -C ui build-storybook` → `Storybook build completed successfully`。
- `archkit inspect .` → `Quality gates passed.`

## Related ADRs

- None.
