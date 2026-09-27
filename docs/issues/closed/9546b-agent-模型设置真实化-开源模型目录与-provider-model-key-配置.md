---
id: 9546b
status: closed
created_at: 2026-09-27T16:34:29.332Z
updated_at: 2026-09-27T16:47:16.954Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-27T16:34:45.668Z
closed_at: 2026-09-27T16:47:16.954Z
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

- [x] 模型目录直接来自 litellm，仓库内不自维护任何模型清单。
- [x] provider / model / key 三者均可选，未配置时行为明确且可测试。
- [x] 连通性测试不泄漏 key，自动化测试不访问真实网络。
- [x] agent-core 提供可注入的 LiteLLMProvider，未安装 litellm 时优雅降级。
- [x] 前端 provider / model 来自 catalog，组件开源优先，i18n 双语齐全，pnpm -C ui test 与 archkit inspect . 通过。
- [x] 全量测试与 archkit inspect . 通过。

## Implementation

两条工作流（后端 + agent-core、前端）在隔离 worktree 中完成。

- **选型**：litellm 作为 provider 适配与模型目录来源，仓库不自维护模型清单。
- **后端 + agent-core**（`worktree-agent-core-pkg` → `23cf35a`，合并 `9912d6d`）：新增 `settings/catalog.py`（懒加载 litellm、`LITELLM_LOCAL_MODEL_COST_MAP=True` 离线读包内成本表、按 `litellm_provider` 分组、key 安全错误映射）；`GET /models/catalog`（settings:read，provider / q 过滤）；`/models/config` 的 provider / endpoint / model / key 全可选（`PUT {}` 可用）；`:test` 经 litellm、要求已配置 model；新增 `litellm_provider.py` 实现 `ModelProvider`（可选 extra、懒加载、未装抛 `LiteLLMUnavailableError`）；基础依赖仍为 httpx + pydantic。
- **前端**（`worktree-agent-models-ui` → `bbee92c`，合并 `ace63b4`）：`types.ts` / `api.ts` 接入 catalog；新增 `ui/select.tsx`（封装 `@base-ui/react`，开源优先）；`settings-form.tsx` provider→model 级联、显式「不设置」保留可选、目录未命中保留已保存值；i18n 双语各 +8 键；MSW mock 与测试；扩展 `ui/prototypes/index.html` 目录选择态（只用既有令牌，无新视觉规则）。

## Verification

| 命令 | 结果 |
| --- | --- |
| `uv run --directory backend pytest -q`（worktree） | exit 0，**120 passed** |
| 集成后 `TEST_DATABASE_URL=...resumate_test_agentcore` 后端 | exit 0，**132 passed** |
| `cd agent-core && uv sync && uv run pytest -q` | exit 0，**64 passed** |
| `pnpm -C ui test` | 11 files / **57 passed** |
| `archkit inspect .` | exit 0，Quality gates passed |

目录数据来自 litellm（实测 131 providers / 3920 models）；测试设置本地成本表、连通性 monkeypatch，不访问真实网络；错误信息不含明文密钥；未装 litellm 时导入包仍可用。

## Related ADRs

- None.
