---
id: 9cc27
status: closed
created_at: 2026-09-15T05:40:01.659Z
updated_at: 2026-09-15T05:42:13.741Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-09-15T05:41:08.121Z
closed_at: 2026-09-15T05:42:13.741Z
---

# 约束页面开发遵守 DESIGN.md

## Background

页面视觉规范已沉淀到根目录 DESIGN.md，但项目规则尚未要求页面开发遵守它。

## Scope

- 在项目 AGENTS.md 增加页面开发前读取并遵守 DESIGN.md 的强制规则。
- 验证规则文件与设计文档路径有效，并通过项目门禁。

## Non-goals

- 不改动页面实现、设计文档内容或全局系统规则。

## Acceptance Criteria

- [x] AGENTS.md 明确所有页面开发必须遵守 DESIGN.md。
- [x] AGENTS.md 与 DESIGN.md 路径有效。
- [x] archkit inspect 通过。

## Implementation

已在项目 AGENTS.md 新增“页面开发”规则：所有页面相关改动前必须读取并遵守根目录 DESIGN.md；规范缺失时必须先补充或记录待确认项。

## Verification

- `test -f DESIGN.md`：通过。
- `archkit inspect .`：Quality gates passed。
- 文档审查：AGENTS.md 新增规则与现有代码修改、路径规则、门禁规则无重复或冲突。

## Related ADRs

- None.
