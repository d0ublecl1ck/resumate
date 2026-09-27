---
id: 9546b
status: in-progress
created_at: 2026-09-27T16:34:29.332Z
updated_at: 2026-09-27T16:34:45.668Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-27T16:34:45.668Z
---

# Agent 模型设置真实化：开源模型目录与 provider/model/key 配置

## Background

Agent 配置目前只有 nextRunMode / budget；模型配置只有 provider / endpoint / model / apiKey 占位与一次外呼测试，且模型清单需要自行维护。目标：让 Agent 的模型设置真实有效，provider + model + key 均为可选配置，模型与数据配置使用开源维护的目录，不自建、不自维护。

## Scope

- **选型**：用 litellm 作为 provider 适配与模型目录来源（其维护 model_prices_and_context_window.json，覆盖 provider / 上下文 / 成本），代码不维护模型清单。
- **backend**：新增只读模型目录端点（如 GET /models/catalog，settings:read），从 litellm 目录返回可选 provider / model；GET|PUT /models/config 保持形状，provider / model / key 全部可选；POST /models/config:test 用 litellm 做连通性测试，不泄漏 key。
- **agent-core**：实现 LiteLLMProvider（ModelProvider 实现）；litellm 作为可选依赖懒导入，未安装时给出清晰错误而非 ImportError 崩溃。
- **测试**：目录端点、config 可选语义、连通性测试（monkeypatch，禁真实网络）、agent-core provider 单测。
- **frontend**：模型设置表单按契约第 17 节接入 GET /models/catalog，provider / model 从目录选择，endpoint / key 保持可选；**组件开源优先**（复用 @base-ui/react、lucide-react、Tailwind 令牌与既有 ui/kit 组件，不自造）；文案走 i18n 双语；同步 MSW mock 与测试。原型未覆盖目录选择态 → 先补原型状态或记录 .freak 待确认。

## Non-goals

- MCP / SDK / Webhook；真实调用外部模型 API 的联网测试。

## Acceptance Criteria

- [ ] 模型目录直接来自 litellm，仓库内不自维护任何模型清单。
- [ ] provider / model / key 三者均可选，未配置时行为明确且可测试。
- [ ] 连通性测试不泄漏 key，自动化测试不访问真实网络。
- [ ] agent-core 提供可注入的 LiteLLMProvider，未安装 litellm 时优雅降级。
- [ ] 前端 provider / model 来自 catalog，组件开源优先，i18n 双语齐全，pnpm -C ui test 与 archkit inspect . 通过。
- [ ] 全量测试与 archkit inspect . 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
