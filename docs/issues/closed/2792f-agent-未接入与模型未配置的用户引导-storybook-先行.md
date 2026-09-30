---
id: 2792f
status: closed
created_at: 2026-09-30T15:38:56.278Z
updated_at: 2026-09-30T15:42:13.172Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-30T15:39:06.188Z
closed_at: 2026-09-30T15:42:13.172Z
---

# Agent 未接入与模型未配置的用户引导（Storybook 先行）

## Background

当前 AI 能力事实上不可用，但界面没有任何说明：

- **运行体未接入**：没有任何进程在跑 `AgentRuntime`。核查命令 `grep -rn 'agent_core' backend/app` 零命中，后端未 spawn 独立运行体进程。用户点开个人资料助手或 Run 面板时，界面表现成「能对话」，但请求不会得到 Agent 结果。
- **模型未配置**：`GET /models/config` 返回 `keyConfigured=false` 时账号没有可用模型凭证（BR-D17：密钥只写入不回显）。此时即使运行体在线也无法调用模型。
- **正常可用态**：将来运行体接入且模型配置完成后应呈现的样子，当前只做占位，供视觉一致性判断。

用户无法从现有界面判断「为什么 AI 不动」，也没有任何指向设置页的引导。本工单只做 Storybook 先行确认，**不接真实页面接线**。

## Scope

- 在定稿原型 `ui/prototypes/index.html` 的「设计补充」区新增 `#agent-onboarding`，登记三态与复用令牌，不新增页面视觉规则。
- 新增前缀型组件 `ui/src/components/agent-onboarding.tsx`：`AgentAvailabilityNotice` 覆盖 `model_missing` / `runtime_offline` / `available` 三态，落点支持个人资料助手抽屉正文（panel）与设置页分区入口（entry）。
- 新增 Storybook story，覆盖三态 × 两个落点；「运行体未接入」一态必须如实说明尚未接入，不提供可用的对话输入。
- 新增 `agentOnboarding` i18n 命名空间（zh-CN / en 键结构一致），全部文案走翻译键。
- 新增 story 测试，沿用仓库 `*.stories.test.tsx` 做法。

## Non-goals

- 不接真实页面接线：不改 `ui/src/App.tsx`、不改 `profile-assistant.tsx` / `settings-form.tsx` 的渲染，不把组件挂进任何真实页面。
- 不新增或修改真实 API 调用、查询键与 `run-panel.tsx` 的既有 mock。
- 不实现运行体进程、不新增 runtime 状态接口、不改动`GET /models/config` 契约。
- 不新增页面视觉规则，不使用吉祥物角色层（只到语法层 + `mascot="badge"`）。

## Acceptance Criteria

- [x] `ui/prototypes/index.html` 新增 `#agent-onboarding` 设计补充，登记三态、落点与复用令牌。
- [x] `ui/src/components/agent-onboarding.tsx` 可按 `state` / `placement` 渲染三态，文案全部来自 `agentOnboarding` 命名空间。
- [x] story 覆盖 `model_missing` / `runtime_offline` / `available` 三态，且每态至少在助手面板与设置入口之一出现；story 名标注落点。
- [x] 「运行体未接入」story 不含可用的对话输入或可点击的伪操作，正文明确「尚未接入」。
- [x] `agent-onboarding.stories.test.tsx` 通过，断言三态中文文案。
- [x] `pnpm -C ui test` 全绿，现有测试不退化；`pnpm -C ui build-storybook` 通过；`archkit inspect .` 通过。

## Implementation

- `ui/prototypes/index.html`：新增 `#agent-onboarding` 设计补充，登记三态、落点与复用令牌；不新增页面视觉规则。
- `ui/src/components/agent-onboarding.tsx`：新增 `AgentAvailabilityNotice`（`state` + `placement`），品牌音量档 C（`StampBadge` + `MascotState mascot="badge"`）；`agentAvailabilityFromModelConfig()` 承载 `keyConfigured` → 阻断态的映射。
- `ui/src/components/agent-onboarding.stories.tsx`：6 条 story（个人资料助手抽屉 3 态 + 设置页入口 2 态 + 三态总览），两条阻断态经 `GET /models/config` 的 MSW 覆盖派生。
- `ui/src/i18n/locales/{zh-CN,en}/agentOnboarding.ts` + 两个 `index.ts`：新增 `agentOnboarding` 命名空间，键结构一致。
- `ui/src/components/agent-onboarding.stories.test.tsx`：story 测试，断言三态文案与「运行体未接入」无可用对话输入。
- `README.md` / `.freak`：同步 story 文件数与前端测试数，登记组件尚未接入真实页面的后续核查线索。

## Verification

- 红：`pnpm -C ui test src/components/agent-onboarding.stories.test.tsx` → `Test Files 1 failed (1)` / `Tests no tests`（`@/components/agent-onboarding.stories` 尚不存在）。
- 绿：同命令 → `Test Files 1 passed (1)` / `Tests 5 passed (5)`。
- `pnpm -C ui test` → `Test Files 23 passed (23)` / `Tests 176 passed (176)`。
- `pnpm -C ui build` → `tsc -b` + `vite build` 通过。
- `pnpm -C ui build-storybook` → `Storybook build completed successfully`；构建产物含 6 条 `components-agentonboarding--*` story。
- `STORYBOOK_PORT=6106 pnpm -C ui storybook` → `http://localhost:6106/index.json` 与 `/iframe.html` 均 200，index.json 含 6 条 onboarding story（验证后已停止）。
- `archkit inspect .` → `Quality gates passed.`

## Related ADRs

- None.
