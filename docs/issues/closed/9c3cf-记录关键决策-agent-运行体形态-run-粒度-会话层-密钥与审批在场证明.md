---
id: 9c3cf
status: closed
created_at: 2026-09-30T15:20:00.000Z
updated_at: 2026-09-30T15:38:11.105Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-30T15:22:00.000Z
closed_at: 2026-09-30T15:38:11.105Z
---

# 记录关键决策：Agent 运行体形态、run 粒度、会话层、密钥与审批在场证明

## Background

Agent 层长期缺一个"运行体"，导致 `agent-core` 的 Runtime、TurnSession、工具表都造好了却没人调用（`grep -rn "agent_core" backend/app` 零命中）。围绕"运行体怎么跑"产生了一串取舍，讨论中逐条确认了五个结论。这些结论只存在于对话里，不写进蓝图的话，下一次会话会重新推演同一批问题，甚至可能按相反方向动手。

ArchKit 的既定原则是「架构必须显式，不靠记忆」（蓝图 → Issue → 提交），因此把五条结论写进 `docs/design.md` 的「关键决策」。

## Scope

在 `docs/design.md` 的 `## 关键决策` 末尾追加五条决策，各自写明结论与选择依据：

1. **运行体形态**：独立进程，先以 CLI 落地；后端后续 spawn 同一个入口；模型调用与 Agent 循环不实现进后端（延续 C-09）。
2. **run 粒度**：步进式，`/step` 推进到下一个断点；每轮模型调用后落 checkpoint。
3. **会话层**：采用 `session` + `message`（不是 `conversation` + `message`）；存储抽成接口，首个实现落在库内；并登记 `resume_versions.conversation_id` / `agent_run_id` 两个预留列的现状与命名不一致。
4. **模型密钥**：保留在后端加密存储，按 run 临时交给运行体、用完即弃；运行体不自持长期密钥。
5. **审批在场证明**：维持现状（持有有效会话 cookie 即视为人类）；写明已知边界与将来必须加码的触发条件。

## Non-goals

- 不改动任何代码、测试、迁移、依赖或 i18n 词条。
- 不落地运行体、不实现 run loop、不建会话表、不动 `resume_versions` 的列（都各自有工单）。
- 不重新讨论已确认的结论。

## Acceptance Criteria

- [x] `docs/design.md` 的 `## 关键决策` 末尾新增五条决策，每条都写明选择依据。
- [x] 五条与既有条目不冲突：特别是不与 C-09（`agent-core` 只走公共 API、模型提供方以 Protocol 注入）以及「PAT 请求 `source` 按 agent 处理」矛盾。
- [x] 明确登记 `resume_versions.conversation_id` / `agent_run_id` 恒空、与 `session` 命名不一致这一事实。
- [x] `archkit inspect .` 通过。

## Implementation

`docs/design.md` 的 `## 关键决策` 末尾新增五条（第 196–200 行），分别对应运行体形态、run 粒度、会话层命名与存储、模型密钥归属、审批在场证明，每条都在同一句里写了选择依据。

其中第 3 条额外登记了现状不一致：`resume_versions.conversation_id` / `agent_run_id` 两列已存在但恒为空，且不存在 `conversations` / `messages` 实体，因此契约中「切换 `active_resume_id` 先结算该会话上一轮」目前只能以「该简历的未关闭轮次」近似表达。

第 5 条把「将来必须加码」的触发条件写成了可执行条件句（公网部署 + 多用户 + XSS 面 -> 必须加 CSRF token 与显式 UI 动作来源标记），避免后续被误判为遗漏。

## Verification

- 位置与条数：`grep -n '^- ' docs/design.md | tail -5` 覆盖第 196–200 行；`sed -n '196,200p' docs/design.md` 可逐条复核。
- 一致性：第 2 条与既有 C-09 条目（`docs/design.md:168`「模型提供方以 Protocol 注入」）方向一致，未改写既有条目；第 5 条与 `docs/design.md:169`「PAT 请求的 `source` 按 agent 处理」不冲突。
- 无重复：`grep -c 'session + message' docs/design.md` 仅命中本条第 3 条。
- `archkit inspect .` → `Quality gates passed.`
- 本次只改 `docs/design.md` 与 issue 文档，未触碰代码、迁移与 i18n。

## Related ADRs

- None.
