---
id: 4bc1d
status: closed
created_at: 2026-09-21T02:23:27.754Z
updated_at: 2026-09-21T02:30:55.993Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 设计哲学
started_at: 2026-09-21T02:24:19.523Z
closed_at: 2026-09-21T02:30:55.993Z
---

# 同步产品需求与最新用户故事

## Background

PRD 需要对齐提交 2843477 中的 100 条用户故事与 C-01～C-13 契约。前序同步已开始，本工单记录后续一致性修正与交付验证。

## Scope

- 同步 JD 管理、微调、软绑定及备份恢复范围。
- 对齐待办控制事件、恢复提交、授权撤销与双岗位题库语义。
- 清理已决开放问题，验证故事覆盖和 Markdown 链接。

## Non-goals

- 实现业务功能、修改主工作区、合并或推送分支。

## Acceptance Criteria

- [x] US-15.1～15.7 和 C-13 在 PRD 中完整体现。
- [x] 轮次、撤销授权、同轮恢复和首版文案审阅与最新契约一致。
- [x] Markdown 文件及锚点链接有效，无仓库外路径依赖。
- [x] 文档格式及项目门禁通过，README 和 AGENTS 已审查。

## Implementation

- 同步 main 提交 `2843477` 的用户故事、公共契约 C-13 和覆盖表。
- 将 JD 管理、软绑定、岗位微调、JD revision、授权撤销冻结、原轮次待办确认、同轮恢复、自动保存关闭和双岗位四类题库写入 PRD。
- 更新 PRD 版本至 0.2，并加入 JD 指标、依赖、风险、追溯和验收路径。

## Verification

- `git diff --check`：通过。
- PRD Markdown 链接检查：120 个链接，无缺失目标。
- PRD 外部路径检查：无 `/Users/`、`Desktop/` 或 `.agents/skills` 引用。
- `archkit inspect .`：Quality gates passed。

## Related ADRs

- None.
