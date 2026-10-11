---
id: edb51
status: in-progress
created_at: 2026-10-11T04:50:00.000Z
updated_at: 2026-10-11T04:42:00.945Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-11T04:42:00.945Z
---

# 把已入库二进制迁入 Git LFS 并留历史映射

## Background

用户已明确同意把已入库的二进制（`docs/deliverables/**` 约 12 MB 与 `docs/e2e/**` 约 33 MB，合计约 45 MB）改写入 Git LFS。历史改写会更换所有相关提交的 SHA，仓库里 `docs/issues` 有 71 个文件引用 165 个短 SHA、`.freak` 引用 9 个，改写后会悬空，因此必须同时留下旧 SHA → 新 SHA 的映射表。

## Scope

- 在主工作区执行 `git lfs migrate import --include="docs/deliverables/**,docs/e2e/**" --everything`。
- 生成 `docs/history-commit-map.tsv`（old_sha / new_sha / subject），文件头说明用途与改写范围。

## Non-goals

- 不改动 `docs/issues` 与 `.freak` 里已被引用的短 SHA（映射表用于人工解析）。
- 不改业务代码与测试、门禁逻辑。

## Acceptance Criteria

- [ ] 改写后 `git lfs ls-files` 数量显著增加（原 58，改写后应覆盖 deliverables 与 e2e 下的二进制）。
- [ ] `docs/history-commit-map.tsv` 覆盖全部旧提交，且能与新提交一一对应。
- [ ] 门禁与三套测试通过。
- [ ] 两个远端分支用 `--force-with-lease` 推送成功，`HEAD == origin/…`。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
