---
id: 05fa6
status: closed
created_at: 2026-10-09T16:19:31.090Z
updated_at: 2026-10-09T16:26:57.476Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-09T16:20:00.238Z
closed_at: 2026-10-09T16:26:57.476Z
---

# AI 引导覆盖全部 Agent 表面：新增 auth_failed 状态并补简历编辑器对话区 Storybook

## Background

AI 是本平台最重要的能力，用户没配置 AI 时必须能在每个 Agent 表面看到引导。现状有两个真实缺口：

- **覆盖不全**：`AgentAvailabilityNotice` 只在个人资料助手抽屉（`profile-assistant.tsx`）与设置页入口（`settings-form.tsx`）渲染；简历编辑器对话区（`resume-chat-panel.tsx` / `run-panel.tsx`）没有这层引导，用户在对话区既看不到「没配 AI」，也拿不到跳转入口。
- **状态不全**：现有六态只有 `model_missing`（`keyConfigured=false`），没有「配了但凭据被拒」。2026-10-10 的真实事故是后者：`keyConfigured=true`，上游 DeepSeek 返回 `401 api key ****be21 is invalid`，界面仍按 `available` 处理，用户看不到任何可执行指引。

后端已把这类失败归一为 `auth` 类别，并只允许已掩码尾号（如 `****be21`）进入用户可见字段（`backend/app/modules/agent/run_errors.py`，issue 4ff97）。前端引导缺的是与之对应的状态与文案。

## Scope

- `ui/src/components/agent-onboarding.tsx`：新增 `auth_failed` 状态、动作与掩码尾号展示；`model_missing` 与 `auth_failed` 共用同一套 action effect（`configure_model` -> `settings`）。
- `ui/src/components/agent-onboarding.stories.tsx`：补齐「表面 x 状态」矩阵 story（个人资料助手抽屉 / 简历编辑器对话区 / 设置页入口）。
- `ui/src/i18n/locales/zh-CN/agentOnboarding.ts`、`ui/src/i18n/locales/en/agentOnboarding.ts`：新增状态与掩码尾号词条，双语键结构一致。
- `ui/prototypes/index.html`：在 SCR-003 简历编辑器对话区登记「AI 未配置 / 凭据无效 / 运行体未接入 / 可用」引导，并与个人资料助手抽屉、设置页入口三处保持一致观感。

## Non-goals

- 不接线真实运行时：`resume-chat-panel.tsx` / `run-panel.tsx` / `profile-assistant.tsx` 的运行行为不变，本轮只到 Storybook 待用户确认。
- 不改 `backend/**`（并发任务范围内），不新增后端契约。
- 不新增第二个引导组件，不引入新的视觉规则。

## Acceptance Criteria

- [x] `AgentAvailability` 含 `auth_failed`；`keyConfigured=true` 且 `lastTest` 命中凭据拒绝特征时判为 `auth_failed`，不再误判为 `available`。
- [x] `auth_failed` 与 `model_missing` 都给出 `configure_model`，经 `agentAvailabilityActionEffect` 归一为 `settings`。
- [x] 引导只渲染来自上游的已掩码尾号（`****be21`）；传入未掩码明文时不渲染，避免泄露。
- [x] Storybook 覆盖三个表面 x 四个状态（model_missing / auth_failed / runtime_offline / available）的 12 条 story，并经 `index.json` 校验存在。
- [x] zh-CN 与 en 词条结构一致，跳转动作写明「去设置与 Agent 配置模型」。
- [x] `pnpm -C ui exec tsc -b --noEmit`、`pnpm -C ui test`、`node quality-gates/run.js`、`archkit inspect .` 全部通过。

## Implementation

- `ui/src/components/agent-onboarding.tsx`：`AgentAvailability` 新增第七态 `auth_failed`。凭据类机器码（`MODEL_AUTH` / `MODEL_AUTH_FAILED` / `UNAUTHORIZED` / `INVALID_API_KEY`）与 `lastTest` 的凭据拒绝特征（`\\b40[13]\\b` / unauthorized / api key…invalid）都判为被拒；`model_missing` 仍优先。常量与后端 `backend/app/modules/agent/run_errors.py` 的 `_AUTH_CODES` / `_AUTH_PATTERNS` / `_MASKED_HINT` 同源。
- 动作契约：`auth_failed` 与 `model_missing` 都取 `configure_model`，经 `agentAvailabilityActionEffect` 归一成 `settings`（同一个 effect，未新增第二条导航路径）。
- 新增 `maskedCredentialTail()` 与 `AgentAvailabilityNotice` 的 `credentialHint` 输入：只渲染形如 `****be21` 的掩码，未掩码明文过滤为 null，界面不会打出完整 key。
- story 矩阵：`ui/src/components/agent-onboarding.stories.tsx` 覆盖「个人资料助手抽屉 / 简历编辑器对话区 / 设置页入口」三表面 × 「model_missing / auth_failed / runtime_offline / available」四态，共 12 条 + `StatesGallery`；阻塞态经真实 `GET /models/config` 契约（MSW）派生。
- i18n：`agentOnboarding.state.auth_failed.{stamp,title,description,action,credentialHint}` 在 zh-CN 与 en 同步补齐，跳转文案写明「设置与 Agent → 模型配置」。
- 原型：`ui/prototypes/index.html` 在 SCR-003 对话区补四态引导，并在个人资料助手抽屉、设置页 Agent 入口两处登记同一组件、同一动作契约与掩码尾号展示；只复用既有 state-block / badge / btn 类与令牌。

## Verification

- `pnpm -C ui exec tsc -b --noEmit` -> `EXIT:0`
- `pnpm -C ui test` -> `Test Files  80 passed (80)` / `Tests  597 passed (597)`
- `pnpm -C ui exec vitest run src/components/agent-onboarding.test.tsx src/components/agent-onboarding.stories.test.tsx` -> `Tests  25 passed (25)`
- `node quality-gates/run.js` -> `Quality gates passed.`
- `archkit inspect .` -> `Quality gates passed.`
- Storybook（`pnpm -C ui exec storybook dev -p 6008 --no-open --ci --quiet`）：`curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6008/index.html` -> `200`；`curl -s http://127.0.0.1:6008/index.json` 中 13 条 `components-agentonboarding--*` 全部存在（缺 0 条），13 条 `/iframe.html?id=...&viewMode=story` 均返回 200。

## Related ADRs

- None.
