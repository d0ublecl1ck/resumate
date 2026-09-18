---
id: edcac
status: in-progress
created_at: 2026-09-18T01:18:25.731Z
updated_at: 2026-09-18T01:19:07.903Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-09-18T01:19:07.903Z
---

# pre-commit hook 自动清理不再为空的目录中的 .gitkeep

## Background

仓库用 `.gitkeep` 占位空目录。目录一旦有其他被 Git 跟踪的文件，`.gitkeep` 即失去意义，残留会造成噪音。需要 pre-commit hook 在提交前自动清理这类 `.gitkeep`。

## Scope

- 新增 `.githooks/pre-commit` 脚本：找出目录中已有其他被跟踪文件的 `.gitkeep`，从索引与磁盘删除并计入本次提交。
- 通过 `core.hooksPath=.githooks` 启用，脚本随仓库分发。

## Non-goals

- 不处理目录仅有未跟踪文件（如 `.DS_Store`）的情况，此时 `.gitkeep` 保留。
- 不引入 husky 等 Node 依赖。

## Acceptance Criteria

- [ ] 目录存在其他被跟踪文件时，commit 自动删除其中 `.gitkeep` 并随提交生效。
- [ ] 目录仅有 `.gitkeep` 或仅有未跟踪文件时，`.gitkeep` 保留。
- [ ] `git config core.hooksPath .githooks` 后 hook 生效。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
