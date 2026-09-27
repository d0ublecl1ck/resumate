---
id: 58d30
status: in-progress
created_at: 2026-09-27T16:01:44.042Z
updated_at: 2026-09-27T16:02:37.538Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-27T16:02:37.538Z
---

# Agent 操作层：公共 API、agent-core 底座与 API 操作 Skill

## Background

PRD 流程 E（外部 Agent 接入）与 open ecosystem 要求用户自有的 Hermes / Codex / MCP / SDK 能通过公共 API 操作简历，与内置 Runtime 共享授权、版本、冲突与审计语义（contracts C-01 / C-03 / C-04 / C-06 / C-09 / C-10）。当前后端只有 Resume CRUD 与 `PUT document` 直接落版本，缺少轮次（UserTurn）、Working Copy、PendingAction 与领域 Patch，导致外部 Agent 无法按契约完成确认与聚合结算；仓库也缺少可被外部 Agent 装载的能力底座与 API 操作指南。

## Scope

三条并行工作流，接口以 [Agent 操作 API 契约](agent-operation-api.md) 为唯一冻结基线：

- **backend API**：新增 `app/modules/agent/`（AgentTurn / PendingAction / AgentOperation）、Resume Working Copy 列与服务函数、领域 Patch 的 validate/preview/apply、approve/reject、4 个新错误码、Alembic 迁移、能力发现补充、后端测试。
- **agent-core 底座**：`agent-core/` Python 包，公共 API 薄客户端、TurnSession、Patch 构造器、工具表、C-09 运行时骨架、Skill 加载器与测试；只走公共 API，不直连数据库。
- **API 操作 Skill**：`agent-core/skills/resumate-api-operations/SKILL.md`，面向 Hermes / Codex / 通用 Agent 的装载指南与端到端示例。

## Non-goals

- PAT Bearer 鉴权与 Scope 强制、MCP Server、TS/Python SDK 发布、Webhook、manual-edits、SSE 流式事件。
- 前端界面接入（本期只交付后端契约、底座与 Skill）。
- Profile 选材生成、JD 岗位微调链路。

## Acceptance Criteria

- [ ] 冻结契约中的 11 个端点全部实现，且每个路由恰好声明一个权限码（guard 测试通过）。
- [ ] 轮次生命周期正确：begin 关闭旧轮、finalize 幂等、cancel 按 C-04 结算、封闭轮迟到写入返回 TURN_ALREADY_CLOSED。
- [ ] approval 模式必须 preview → approve → apply；full_access 可 apply 直写；越权/未审批返回契约错误码。
- [ ] finalize 聚合为每轮每份简历至多一个版本，无差异不创建空版本；基线过期返回 409 BASE_VERSION_STALE。
- [ ] Working Copy 与正式 document 分离，working-document 端点可读。
- [ ] Alembic 迁移可从 d1e5f9a3b7c2 升级到 head。
- [ ] agent-core 包可 `uv run pytest` 通过，且不依赖业务数据库。
- [ ] Skill 文档覆盖能力发现、鉴权、模式、approval/full_access 两条闭环、错误码与端到端示例。
- [ ] `archkit inspect .` 与 `uv run --directory backend pytest` 全部通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
