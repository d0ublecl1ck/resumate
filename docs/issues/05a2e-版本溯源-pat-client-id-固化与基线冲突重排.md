---
id: 05a2e
status: in-progress
created_at: 2026-09-27T16:34:28.992Z
updated_at: 2026-09-27T16:34:45.155Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-27T16:34:45.155Z
---

# 版本溯源、PAT client_id 固化与基线冲突重排

## Background

C-03 要求 ResumeVersion 记录 client_id / conversation_id / user_turn_id / agent_run_id / execution_mode；当前 resume_versions 与响应都缺这些字段，agent finalize 产生的版本无法自证来源轮次、客户端与模式。另有两项评审决定：PAT 请求的 client_id 需服务端固化（防伪造）；用户手动推进基线后，Agent 暂存改动应重排到新基线继续，冲突则排队保留而非丢弃。

## Scope

- **版本溯源**：resume_versions 增 5 个可空列（client_id / conversation_id / user_turn_id / agent_run_id / execution_mode），新增 Alembic 迁移；ResumeVersionResponse 暴露；agent finalize 写入 client_id / user_turn_id / execution_mode；手动 PUT document 的 user_turn_id / execution_mode 留空。
- **PAT client_id 固化**：PAT 认证时以 token name（回退 pat_id）固化客户端标识，begin_turn 忽略请求体 clientId；会话请求保持可自报。
- **基线重排与队列**：按契约第 15 节实现三方重排；冲突返回 409 REBASE_CONFLICT 并保留暂存；cancel 不再丢弃。
- **审计落点**：确认 access_logs 只留鉴权语义，不新增业务审计表（契约第 16 节）。

## Non-goals

- MCP / SDK / Webhook / OAuth / 前端接入；内置 Runtime 的模型接入见 9546b。

## Acceptance Criteria

- [x] resume_versions 新迁移含 5 列且可升级；响应含对应 5 字段。
- [x] agent finalize 版本带 client_id / user_turn_id / execution_mode；PUT document 版本相应为空。
- [x] PAT 建轮次时 client_id = PAT name，请求体 clientId 被忽略；会话仍可自报。
- [x] 用户推进基线后暂存改动在新基线上继续；冲突时保留暂存并返回 REBASE_CONFLICT。
- [x] cancel 遇基线推进不再丢弃暂存。
- [x] 全量后端测试与 archkit inspect . 通过。

## Implementation

单条工作流在隔离 worktree 中完成（含一次死锁修复）。

- **后端**（`worktree-agent-api` → `62e89ba`，修复 `c1e191f`，合并 `8b68ecf`）：新增纯三方重排引擎 `agent/rebase.py`；`resume_versions` 增 5 可空列与迁移 `b8e4d2f6a1c9`（down_revision `f7b1c3e5a9d2`），`ResumeVersionResponse` 暴露，`_commit_version` / `commit_working_copy` 写入溯源；`CurrentUser.client_id` + PAT 认证固化 client_id（忽略请求体）；`agent/service.py` 接入 `_rebase_if_needed`，冲突新增 409 `REBASE_CONFLICT`；新增逃逸路径 `_rebase_or_abandon`，cancel 与 begin 自动关闭遇冲突不再死锁。
- **审计落点**：确认 `access_logs` 仅鉴权语义，未新增业务审计表。
- 契约：`docs/agent/agent-operation-api.md` §14 / §15（含第 7 条逃逸路径）。

## Verification

| 命令 | 结果 |
| --- | --- |
| `uv run --directory backend pytest -q`（worktree，含逃逸路径） | exit 0，**127 passed** |
| 集成后 `TEST_DATABASE_URL=...resumate_test_agentcore uv run --directory backend pytest -q` | exit 0，**132 passed** |
| `DATABASE_URL=sqlite:// uv run --directory backend alembic upgrade head` | exit 0 |
| `archkit inspect .` | exit 0，Quality gates passed |

覆盖：5 列迁移与响应字段、agent finalize 写入溯源 / 手动 PUT 留空、PAT client_id 固化且伪造被忽略、干净重排继续（`baseRebased`）、冲突 409 保留暂存、冲突轮次可 cancel（暂存按显式取消丢弃）、冲突后 begin 自动关闭旧轮并开新轮。

## Related ADRs

- None.
