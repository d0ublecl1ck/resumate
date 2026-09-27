---
id: 58d30
status: closed
created_at: 2026-09-27T16:01:44.042Z
updated_at: 2026-09-27T16:11:29.923Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-27T16:02:37.538Z
closed_at: 2026-09-27T16:11:29.923Z
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

- [x] 冻结契约中的 11 个端点全部实现，且每个路由恰好声明一个权限码（guard 测试通过）。
- [x] 轮次生命周期正确：begin 关闭旧轮、finalize 幂等、cancel 按 C-04 结算、封闭轮迟到写入返回 TURN_ALREADY_CLOSED。
- [x] approval 模式必须 preview → approve → apply；full_access 可 apply 直写；越权/未审批返回契约错误码。
- [x] finalize 聚合为每轮每份简历至多一个版本，无差异不创建空版本；基线过期返回 409 BASE_VERSION_STALE。
- [x] Working Copy 与正式 document 分离，working-document 端点可读。
- [x] Alembic 迁移可从 d1e5f9a3b7c2 升级到 head。
- [x] agent-core 包可 `uv run pytest` 通过，且不依赖业务数据库。
- [x] Skill 文档覆盖能力发现、鉴权、模式、approval/full_access 两条闭环、错误码与端到端示例。
- [x] `archkit inspect .` 与 `uv run --directory backend pytest` 全部通过。

## Implementation

三条工作流在各自隔离的 git worktree 中并行完成，接口基线为冻结契约。

- **backend**（`worktree-agent-api` → `863fb6c`，合并 `f681e19`）：新增 `backend/app/modules/agent/`（`models.py`：AgentTurn / PendingAction / AgentOperation；`patch.py`：纯领域 Patch 引擎；`schemas.py` / `dao.py` / `service.py` / `api.py`）；`resume` 增补 4 个 Working Copy 列与 read/stage/commit/clear 服务函数（resume 不反向依赖 agent）；`shared/errors.py` 新增 TURN_ALREADY_CLOSED / TURN_NOT_OPEN / PENDING_ACTION_NOT_APPROVED / PENDING_ACTION_STALE / IDEMPOTENCY_CONFLICT；`main.py` 注册 router；`migrations/env.py` 导入模型；迁移 `f7b1c3e5a9d2`（down_revision `d1e5f9a3b7c2`）；`access` 能力发现追加 agent.turns / agent.patches / agent.pending_actions；`tests/test_agent.py` 12 例。
- **agent-core 底座**（`worktree-agent-core-pkg` → `a2e9d9e`，合并 `cdfc3b2`）：`agent-core/` uv 包，`src/resumate_agent_core/` 下 config / errors / models / patches / client / turn / tools / runtime / skills；httpx + pydantic v2；ModelProvider Protocol；测试 56 例。
- **API 操作 Skill**（`worktree-agent-skill` → `43bed71`，合并 `d647bc0`）：`agent-core/skills/resumate-api-operations/SKILL.md` 与 `reference.md`。
- 蓝图 `docs/design.md` 与 `README.md` 登记 Agent 层与 `agent-core/`。

附带修复：既有迁移 `e2f7a4c8b1d3_create_rbac_tables.py` 的裸 `now()` 在 SQLite 下报 `no such function: now`（已在 `main` 复现），改为标准 `CURRENT_TIMESTAMP`，使 README 要求的 `DATABASE_URL=sqlite:// alembic upgrade head` 可通过；该迁移在 PostgreSQL 上语义不变，且在既有库上已应用、不会重跑。

## Verification

在集成分支 `.claude/worktrees/agent-core`（`worktree-agent-core`）执行：

| 命令 | 结果 |
| --- | --- |
| `uv run --directory backend pytest -q` | exit 0，**102 passed**（90 基线 + 12 新增）；`test_access_control.py::test_every_route_declares_exactly_one_permission` 通过 |
| `cd agent-core && uv run pytest -q` | exit 0，**56 passed**；全部经 `httpx.MockTransport`，无网络与数据库 |
| `DATABASE_URL=sqlite:// uv run --directory backend alembic upgrade head` | exit 0（既有迁移修复后） |
| `archkit inspect .` | exit 0，Quality gates passed |
| 契约对称性核对 | backend schemas 与 agent-core models 全部重叠模型字段逐一一致（5 种 PatchOp、UserTurn / TurnResult / PendingAction / DiffItem / WorkingDocument 及各响应） |
| Skill 装载核对 | `SkillLoader().discover()` 默认目录找到 `resumate-api-operations` 并解析 frontmatter |

> 说明：本轮仅交付后端契约、`agent-core` 底座与 Skill；PAT Bearer / MCP / SDK / Webhook / 前端接入属后续工单，未在本期验收。

## Related ADRs

- None.
