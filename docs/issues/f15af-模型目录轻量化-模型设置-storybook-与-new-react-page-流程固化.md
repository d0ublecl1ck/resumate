---
id: f15af
status: in-progress
created_at: 2026-09-27T17:17:29.083Z
updated_at: 2026-09-27T17:17:56.177Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-27T17:17:56.177Z
---

# 模型目录轻量化、模型设置 Storybook 与 new-react-page 流程固化

## Background

9546b 用了 litellm 作为 provider 适配与模型目录来源，实测安装体积 98MB、venv 80 个包，过重。模型目录其实只是一个 JSON 数据源，provider 调用也只需 OpenAI 兼容协议，可以拆开用更轻的方案。另外模型设置前端没有补 Storybook，而本项目「页面开发」需要 Storybook 先行给用户确认；该顺序此前散落在对话里，应固化为项目 skill。

## Scope

- **目录轻量化**：后端模型目录改读开源目录 models.dev 的快照（刷新脚本把上游 api.json 投影为 id / name / limit / cost 字段写入本地快照），运行时离线读取；移除 litellm 依赖。
- **provider 轻量化**：模型连通性探活与 agent-core 的 provider 改为 httpx 的 OpenAI 兼容 /chat/completions 实现（OpenAICompatibleProvider）；移除 LiteLLMProvider 与 litellm 可选 extra。
- **模型设置 Storybook**：为 catalog 选择器补 stories，覆盖默认 / 加载中 / 错误 / 目录未命中 / 无 provider 等状态，MSW 驱动，`pnpm -C ui build-storybook` 通过。
- **流程固化**：新增系统 skill `new-react-page`（安装在 `~/.agents/skills/`，原型 → **Storybook 先给用户确认** → 确认后真实对接），并在 `AGENTS.md` 登记触发场景。

## Non-goals

- 原生非 OpenAI 兼容协议（Anthropic / Gemini 原生）的适配。
- MCP / SDK / Webhook。

## Acceptance Criteria

- [ ] 后端不再依赖 litellm；`GET /models/catalog` 的 source 为 "models.dev"，数据来自本地快照，离线可读，测试不联网。
- [ ] `POST /models/config:test` 与 agent-core provider 走 httpx OpenAI 兼容实现；旧 LiteLLMProvider 已移除。
- [ ] 后端 pytest / agent-core pytest / `archkit inspect .` 通过。
- [ ] 模型设置 catalog 各状态有 Storybook story，`pnpm -C ui build-storybook` 与 `pnpm -C ui test` 通过。
- [ ] `new-react-page` 作为系统 skill 落位于 `~/.agents/skills/`（含 Storybook 先行停止点），并在 `AGENTS.md` 登记。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
