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

- [ ] `summarize_changes` 公开，agent 侧不再跨模块调用下划线私有 helper。
- [ ] 同一轮次重复 preview 后只有一个 `pending` PendingAction，旧待办变为 `stale`。
- [ ] Alembic SQLite 链路回归测试通过并锁定全部迁移。
- [ ] 按 `pat-auth.md`：`resume:read` PAT 调写端点返回 `SCOPE_INSUFFICIENT`；撤销 / 过期 / 未知 token 返回对应 401；PAT 传 `executionMode=full_access` 仍按账户配置固化为 approval；成功与拒绝各写 `access_logs`。
- [ ] 既有后端测试全部通过且无回归，`archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
