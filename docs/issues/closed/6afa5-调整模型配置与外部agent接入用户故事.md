---
id: 6afa5
status: closed
created_at: 2026-09-18T02:36:45.293Z
updated_at: 2026-09-18T02:38:03.821Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-09-18T02:37:00.285Z
closed_at: 2026-09-18T02:38:03.821Z
---

# 调整模型配置与外部Agent接入用户故事

## Background

用户提出三点调整：1）个人用户在设置中配置 model/provider，由后端统一提供 AI 能力；2）外部 Agent 期望提供 SKILL 指导后端 API 调用方式并告知用户可能的操作；3）删除 US-12.4 能力发现与 Webhook。

## Scope

- 修改 jobseeker.md US-13.1：用户配置 model/provider、后端 Model Gateway 提供 AI 能力
- agent.md 新增外部 Agent SKILL 故事
- 删除 agent.md US-12.4 能力发现与 Webhook

## Non-goals

- None.

## Acceptance Criteria

- [x] 三处变更落盘且故事总数与编号正确
- [x] 门禁通过

## Implementation

- jobseeker.md US-13.1 改为用户级 model/provider 配置 + 后端 Model Gateway 统一提供 AI 能力。
- agent.md US-12.4 由"能力发现与 Webhook"替换为"外部 Agent SKILL 接入指南"（P0）。
- README 优先级汇总移除 Webhook。

## Verification

- grep 确认无 webhook 残留；故事编号连续。
- `archkit inspect .` 通过。

## Related ADRs

- None.
