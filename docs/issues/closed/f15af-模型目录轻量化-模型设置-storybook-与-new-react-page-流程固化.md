---
id: f15af
status: closed
created_at: 2026-09-27T17:17:29.083Z
updated_at: 2026-09-27T17:23:13.905Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-27T17:17:56.177Z
closed_at: 2026-09-27T17:23:13.905Z
---

# 模型目录轻量化、模型设置 Storybook 与 new-react-page 流程固化

## Background

9546b 用了 litellm 作为 provider 适配与模型目录来源，实测安装体积 98MB、venv 80 个包，过重。模型目录其实只是一个 JSON 数据源，provider 调用也只需 OpenAI 兼容协议，可以拆开用更轻的方案。另外模型设置前端没有补 Storybook，而本项目「页面开发」需要 Storybook 先行给用户确认；该顺序此前散落在对话里，应固化为项目 skill。

## Scope

- **目录轻量化**：后端模型目录改读开源目录 models.dev 的快照（刷新脚本把上游 api.json 投影为 id / name / limit / cost 字段写入本地快照），运行时离线读取；移除 litellm 依赖。
- **provider 轻量化**：模型连通性探活与 agent-core 的 provider 改为 httpx 的 OpenAI 兼容 /chat/completions 实现（OpenAICompatibleProvider）；移除 LiteLLMProvider 与 litellm 可选 extra。
- **模型设置 Storybook**：为 catalog 选择器补 stories，覆盖默认 / 加载中 / 错误 / 目录未命中 / 无 provider 等状态，MSW 驱动，`pnpm -C ui build-storybook` 通过。
- **流程固化**：新增系统 skill `new-react-page`（安装为宿主 skill，原型 → **Storybook 先给用户确认** → 确认后真实对接），并在 `AGENTS.md` 登记触发场景。

## Non-goals

- 原生非 OpenAI 兼容协议（Anthropic / Gemini 原生）的适配。
- MCP / SDK / Webhook。

## Acceptance Criteria

- [x] 后端不再依赖 litellm；`GET /models/catalog` 的 source 为 "models.dev"，数据来自本地快照，离线可读，测试不联网。
- [x] `POST /models/config:test` 与 agent-core provider 走 httpx OpenAI 兼容实现；旧 LiteLLMProvider 已移除。
- [x] 后端 pytest / agent-core pytest / `archkit inspect .` 通过。
- [x] 模型设置 catalog 各状态有 Storybook story，`pnpm -C ui build-storybook` 与 `pnpm -C ui test` 通过。
- [x] `new-react-page` 作为系统 skill 落位于宿主 skill 目录（含 Storybook 先行停止点），并在 `AGENTS.md` 登记。

## Implementation

三条工作流在隔离 worktree 中完成。

- **目录与 provider 轻量化**（`worktree-agent-core-pkg` → `bd28795`，合并 `aca5471`）：新增 `backend/scripts/refresh_model_catalog.py`，从 models.dev 拉取并投影为本地快照 `backend/app/modules/settings/data/model_catalog.json`（2.06MB，223 providers / 8170 models，全部保留不裁剪）；`catalog.py` 只读本地快照，`GET /models/catalog` 的 `source="models.dev"`、provider/q 过滤与 §17 形状不变；探活改为 httpx OpenAI 兼容 `/chat/completions`（endpoint 为空且 provider=openai 时用官方默认 base_url，否则 422）；移除 litellm 依赖与 `LiteLLMProvider`，新增 `OpenAICompatibleProvider`（httpx、可注入 client、tools/usage 映射、best-effort cost）；httpx 提升为后端运行时依赖。
- **模型设置 Storybook**（`worktree-agent-models-ui` → `82d38cf` + `883a79d`，合并 `50a6fd7` + `49526b7`）：新增 `settings-form.stories.tsx` 覆盖 6 个状态（Default / CatalogLoading / CatalogError / ModelNotInCatalog / ProviderNotInCatalog / NoProviderSelected），每 story 通过 MSW 覆盖 + 独立 QueryClient；配套 `settings-form.stories.test.tsx`；并把 UI 内 12 处 litellm 引用对齐为 models.dev。
- **流程固化**：系统 skill `new-react-page` 安装到宿主 skill 目录，在 `AGENTS.md` 登记（原型 → **Storybook 先行确认停止点** → 真实对接）。

## Verification

在集成分支 `.claude/worktrees/agent-core` 串行执行（后端使用专用库 `resumate_test_agentcore`，避免多 worktree 竞态）：

| 命令 | 结果 |
| --- | --- |
| `TEST_DATABASE_URL=...resumate_test_agentcore uv run --directory backend pytest -q` | exit 0，**141 passed** |
| `cd agent-core && uv sync && uv run pytest -q` | exit 0，**69 passed** |
| `pnpm -C ui test` | 12 files / **63 passed** |
| `pnpm -C ui build-storybook` | exit 0，build completed successfully |
| `DATABASE_URL=sqlite:// uv run --directory backend alembic upgrade head` | exit 0 |
| `archkit inspect .` | exit 0，Quality gates passed |
| `grep -i litellm backend/ agent-core/` | **0**；`ui/` 亦为 0 |

> 注意：目录快照 `model_catalog.json`（2.06MB）是提交进仓库的投影数据，刷新由 `scripts/refresh_model_catalog.py` 手动执行；运行时只读本地文件，唯一联网路径是刷新脚本。

## Related ADRs

- None.
