---
id: 5c238
status: closed
created_at: 2026-10-11T05:10:00.000Z
updated_at: 2026-10-11T04:58:29.350Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-11T04:58:08.568Z
closed_at: 2026-10-11T04:58:29.350Z
---

# 收窄 LFS 模式，消除非 LFS 路径的假 modified 与 fsck 告警

## Background

ef128 把 `.gitattributes` 写成全局扩展名匹配（`*.png` 等），但 `ui/public/**` 与 `ui/src/assets/**` 下的既有 PNG 早于 LFS 引入就以普通 blob 入库。结果是 `git lfs fsck` 退出码 1（11 条 `unexpectedGitObject`），且这些路径在任何新建 worktree 里都显示为 modified（内容其实与 HEAD 逐字节一致）。

## Scope

- 把 `.gitattributes` 的扩展名规则限定到 `docs/**`（LFS 文件全部在 `docs/deliverables/**`、`docs/e2e/**`、`docs/competition/**`）。
- 验证 `git lfs fsck` 退出码 0、两个 worktree 与临时 worktree 的 `git status --short` 为空、`git lfs ls-files` 仍为 365。

## Non-goals

- 不改 LFS 跟踪的文件集合（不迁移、不回退任何二进制）。
- 不改业务代码、测试与门禁逻辑。

## Acceptance Criteria

- [x] `.gitattributes` 扩展名规则收窄到 `docs/**`。
- [x] `git lfs fsck` 退出码 0。
- [x] `git lfs ls-files | wc -l` = 365；`docs/deliverables/S1-方案概要.pdf` 工作区文件头为 `%PDF`。
- [x] 主 worktree、`zj-fwwb-2026` worktree、临时 worktree 的 `git status --short` 均为空。
- [x] 门禁与三套测试通过；两条分支强推成功且 `HEAD == origin/…`。

## Implementation

- 把 `.gitattributes` 的扩展名规则从全局（`*.png` 等）收窄为 `docs/**/*.<ext>`，保留原有的 `docs/deliverables/**` 与 `docs/e2e/**` 两条目录级规则；LFS 跟踪的文件集合不变。

## Verification

- `git lfs fsck` → `Git LFS fsck OK`，退出码 0（收窄前为退出码 1 + 11 条 `unexpectedGitObject`）。
- `git lfs ls-files | wc -l` = 365；`head -c 4 docs/deliverables/S1-方案概要.pdf` = `%PDF`。
- 三个工作树 `git status --short` 全为空：主工作区、`zj-fwwb-2026`、临时 `/tmp/lfs-check`（detached，验证后已 remove）。
- 门禁与三套测试通过。

## Related ADRs

- None.
