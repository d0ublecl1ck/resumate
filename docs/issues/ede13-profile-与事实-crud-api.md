---
id: ede13
status: open
created_at: 2026-09-27T02:22:57.728Z
updated_at: 2026-09-27T02:22:57.728Z
priority: high
labels: []
parent: af02e
blocked_by: [d8c9f]
design_section: 数据模型
---

# Profile 与事实 CRUD API

## Background

`/profile` 页面需要读取职业事实库，并支持直接编辑基本信息与事实。前端 `lib/api.ts` 已有 mock 契约，后端没有对应的持久化与 CRUD。

## Scope

- `Profile` 与 `ProfileFact` 模型（PostgreSQL），字段对齐 `ui/src/lib/types.ts`。
- `GET /profile`：不存在时按当前用户创建空 Profile 并返回完整对象（含 basics、facts、versions）。
- `PATCH /profile/basics`：更新基本信息。
- 事实 CRUD：`GET /profile/facts`、`POST /profile/facts`、`GET /profile/facts/{fact_id}`、`PATCH /profile/facts/{fact_id}`、`DELETE /profile/facts/{fact_id}`。
- 新增事实默认 `evidence.status=unverified`（BR-D09），仅显式传入 `verified` 才是已核实。
- 删除事实前计算 `referencedBy`（依据 Resume 版本快照中的 fact id）并返回影响摘要。

## Non-goals

- 不实现对话解析 `POST /profile:parse-input`（Agent 能力）。
- 不实现 match-job、resume-drafts 与 Profile 版本 diff/restore。
- 不实现前端接入。

## Acceptance Criteria

- [ ] `GET /profile` 返回 Profile（含 basics、facts、versions），首次访问自动创建且幂等。
- [ ] `PATCH /profile/basics` 更新后回读一致。
- [ ] 事实四种 CRUD 端点可用，PATCH 支持部分字段更新，删除返回反向引用影响。
- [ ] 新增事实默认 `unverified`，显式传 `verified` 才标记已核实。
- [ ] 资源不存在返回统一 404 错误码，不泄露其他用户数据。
- [ ] `uv run --directory backend pytest` 与 `archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
