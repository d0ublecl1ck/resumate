---
id: 78ede
status: in-progress
created_at: 2026-09-27T16:14:25.457Z
updated_at: 2026-09-27T16:14:38.432Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-27T16:14:38.432Z
---

# Agent 操作层跟进：helper 公开化、preview 作废、PAT Scope 鉴权与迁移回归

## Background

58d30 交付后的代码评审发现三处改进与一项未验证边界：agent.service 跨模块调用 resume 的私有 helper `_summarize_changes`；approval 模式下重复 preview 会在同一轮次堆积多个 pending PendingAction；PAT Bearer 与 Scope 请求鉴权未实现，导致 `SCOPE_INSUFFICIENT` 只能停在文档层面、无法端到端验证。另有一处既有迁移的 SQLite 兼容 bug 已修，但缺少回归保护。

## Scope

- **backend 清理**：把 `resume/service.py` 的 `_summarize_changes` 提为公开 `summarize_changes` 并同步 resume / agent 两处调用；`agent.service.preview_patch` 在新建 PendingAction 前把同轮次既有 `pending` 置为 `stale`（原因「已被新的预览取代」）；复核全部迁移无 SQLite 不兼容 SQL，新增 Alembic SQLite 链路回归测试。
- **PAT/Scope 鉴权**：按 [pat-auth.md](pat-auth.md) 实现 Bearer PAT 认证、Scope 强制、撤销 / 过期处理、`last_used_at` 与访问审计；PAT 请求忽略 `executionMode` 入参，模式只从 agent 配置 / 账户默认解析。

## Non-goals

- MCP Server、TS/Python SDK、Webhook、OAuth、前端接入。

## Acceptance Criteria

- [x] `summarize_changes` 公开，agent 侧不再跨模块调用下划线私有 helper。
- [x] 同一轮次重复 preview 后只有一个 `pending` PendingAction，旧待办变为 `stale`。
- [x] Alembic SQLite 链路回归测试通过并锁定全部迁移。
- [x] 按 `pat-auth.md`：`resume:read` PAT 调写端点返回 `SCOPE_INSUFFICIENT`；撤销 / 过期 / 未知 token 返回对应 401；PAT 传 `executionMode=full_access` 仍按账户配置固化为 approval；成功与拒绝各写 `access_logs`。
- [x] 既有后端测试全部通过且无回归，`archkit inspect .` 通过。

## Implementation

两条工作流在隔离 worktree 中并行完成。

- **backend 清理**（`worktree-agent-followups` → `5ab7090`，合并 `43cb7f9`）：`resume/service.py` 的 `_summarize_changes` 提为公开 `summarize_changes`，resume 与 agent 全部调用点同步；`agent.service.preview_patch` 在 approval 下新建待办前把同轮次既有 `pending` 置 `stale`（`stale_reason="已被新的预览取代"`），approved/consumed/rejected 不动；新增 `backend/tests/test_migrations.py` 跑通 Alembic SQLite 全链路并断言 agent 三表、resumes 四列与动态 head；`test_agent.py` +2。
- **PAT/Scope 鉴权**（`worktree-agent-pat` → `07dfd6e`，合并 `7c92f10`）：`CurrentUser` 增加 `auth_kind` / `pat_id` / `scopes`；`get_current_user` 优先解析 Bearer PAT（SHA-256 查库、撤销 / 过期 / 封禁、写审计、更新 `last_used_at`）；`require_permission` 在 PAT 身份下强制 scope；`shared/errors.py` 增加 `TokenRevoked` / `ScopeInsufficient`；`access.dao` 增加 `get_token_by_hash` / `record_access_log`；`_resolve_mode` 对 PAT 忽略 `executionMode`；`test_pat_auth.py` 10 例。
- 文档：新增 [pat-auth.md](pat-auth.md)，并在 `docs/design.md` 登记 PAT 鉴权与 preview 作废约定。

## Verification

在集成分支 `.claude/worktrees/agent-core`（`worktree-agent-core`）执行：

| 命令 | 结果 |
| --- | --- |
| `uv run --directory backend pytest -q` | exit 0，**115 passed**（102 基线 + 13 新增，0 回归） |
| `archkit inspect .` | exit 0，Quality gates passed |
| `test_migrations.py` | 真跑 Alembic SQLite 全链路，head 动态解析，agent 三表 + resumes 四列断言通过 |
| `test_pat_auth.py` | `resume:read` PAT 调写端点 → 403 `SCOPE_INSUFFICIENT`；撤销 → 401 `TOKEN_REVOKED`；过期 / 未知 / 非前缀 → 401 `UNAUTHENTICATED`；`resume:write` PAT 可建轮次并 apply；Bearer 优先于会话 Cookie；PAT 传 `executionMode=full_access` 仍固化为 approval；允许与拒绝各写 `access_logs`；`last_used_at` 更新 |

> 说明：本轮只做跟进修复与 PAT 请求鉴权；MCP / SDK / Webhook / OAuth / 前端接入仍不在范围。

## Related ADRs

- None.
