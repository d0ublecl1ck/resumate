---
id: 1a334
status: closed
created_at: 2026-09-29T04:20:00.000Z
updated_at: 2026-09-29T04:09:14.985Z
priority: high
labels: []
parent: null
blocked_by: []
started_at: 2026-09-29T04:07:40.076Z
closed_at: 2026-09-29T04:09:14.985Z
---

# 对齐 Skill 与运行时事实并补齐对外 README

## Background

`agent-core/skills/resumate-api-operations` 是外部 Agent（Hermes / Codex / 通用 MCP 客户端）驱动 Resumate 公共 API 的装载契约，2026-09-29 随仓库转为公开。它出生在 2026-09-28 00:06，比契约 §13/§15 定稿早 34 分钟，之后只补过一行邮箱验证说明，从未与运行时对账。

实测偏差（起真实服务复现）：PAT Bearer 对 11 个端点可用（Bearer 直调 `working-document` 200、`create_turn` 201），但 SKILL.md §1.2 写「不带 Bearer」「不要尝试 Bearer」；PAT 请求的 `executionMode` 与 `clientId` 由服务端决定，文档未写；`REBASE_CONFLICT` / `baseRebased` 完全缺失；§5.6 组合示例原样执行返回 `SECTION_NOT_FOUND`；§8 工具名与 `tools.py` 的 `TOOLS` 注册表不一致。

同时该 Skill 没有任何 README，安装方拿不到首屏价值、装载方式与安全边界。

## Scope

- SKILL.md §1.2 / §1.3 按运行时事实重写鉴权段：Bearer PAT 优先、会话 Cookie 回落；补齐 `TOKEN_REVOKED` / `ACCOUNT_BANNED` / `SCOPE_INSUFFICIENT` 的 PAT 语义。
- SKILL.md §2 / §4.1 补 PAT 例外：PAT 请求的 `executionMode` 与 `clientId` 由服务端决定。
- SKILL.md §6 补 `REBASE_CONFLICT`、`baseRebased` 与新增 §6.1 基线重排说明。
- SKILL.md §5.6 组合示例补 `upsertSection`，使示例可原样执行。
- SKILL.md §8 工具名对齐 `agent-core/src/resumate_agent_core/tools.py` 的 `TOOLS` 注册表。
- SKILL.md §1.1 标注 `mcpUrl` 为占位、说明 `contractVersion` 编号口径。
- `reference.md` 鉴权行与错误码表同步。
- 新增 `agent-core/skills/resumate-api-operations/README.md`。

## Non-goals

- 不改 `agent-core` / `backend` 实现。
- 不把 Skill 拆成套件。
- 不为对外分发补 LICENSE，不注册技能市场。
- 不改写 git 历史。

## Acceptance Criteria

- [x] SKILL.md 与 reference.md 的鉴权描述与 `backend/app/modules/auth/deps.py` 的实际行为一致（Bearer 优先 + scope 强制）。
- [x] `REBASE_CONFLICT` 与 `baseRebased` 在 SKILL.md 中有明确恢复动作。
- [x] §5.6 组合示例在无章节的新简历上可原样通过 validate。
- [x] §8 工具名与 `tools.py` 的 `TOOLS` 键集合完全一致。
- [x] `README.md` 存在，首屏说明价值，并给出装载方式、触发方式与安全边界。
- [x] `archkit inspect .` 通过。

## Implementation

- SKILL.md：§1.1 增 `mcpUrl` 占位与 `contractVersion` 口径两条；§1.2 按「Bearer 优先、会话回落」重写并给出 PAT 签发流程与可申请 scope 白名单；§1.3 增 `TOKEN_REVOKED`、`ACCOUNT_BANNED`，改写 `UNAUTHENTICATED` / `EMAIL_NOT_VERIFIED` / `FORBIDDEN` / `SCOPE_INSUFFICIENT` 四行；§2 增 PAT 例外；§4.1 补 PAT 字段失效说明；§5.6 组合示例改为在空白简历上可直接执行的四条 op 并增删除类 op 的注意事项；§6 增 `REBASE_CONFLICT` 行与新增 §6.1 基线重排；§8 工具名改为 `TOOLS` 注册表的真实键名。
- reference.md：鉴权行改为双路径描述；错误码表增 `REBASE_CONFLICT` 与 `TOKEN_REVOKED`，改写 `SCOPE_INSUFFICIENT`。
- 新增 README.md：按鲁班 house-style 组织（引语钩子、人感开场、真实终端回放、装载、触发方式、交付物、对比表、安全边界、文件结构、验证方式、已知边界）。未添加 `npx skills add` 与 skills.sh 徽章——该 Skill 随产品仓库分发、无独立 skill 仓库根，写上去就是假的一行安装。

## Verification

- §5.6 组合示例：从 SKILL.md 原文提取 JSON 后原样打真实服务（sqlite + 本地 Redis，端口 8013）→ `{"valid":true,"errors":[]}`，apply → `{"applied": true, "changeCount": 3, "affectedSections": ["工作经历", "个人简介", "基础信息"]}`。
- 工具名一致性：§8 表格的 12 个键逐个对照 `agent-core/src/resumate_agent_core/tools.py` 的 `TOOLS` 定义（`capability` / `create_turn` / `get_turn` / `finalize_turn` / `cancel_turn` / `validate_patch` / `preview_patch` / `apply_patch` / `list_pending_actions` / `get_working_document` / `approve_action` / `reject_action`）。
- README 相对链接：`reference.md` 与 `../../../docs/agent/agent-operation-api.md` 均存在。
- `archkit inspect .` → `Quality gates passed.`
- 后端与 agent-core 测试未受改动影响（本次只改 Markdown）。

## Related ADRs

- None.
