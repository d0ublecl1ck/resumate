---
id: edb51
status: closed
created_at: 2026-10-11T04:50:00.000Z
updated_at: 2026-10-11T04:42:14.312Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-11T04:42:00.945Z
closed_at: 2026-10-11T04:42:14.312Z
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

- [x] 改写后 `git lfs ls-files` 数量显著增加（原 58，改写后 365）。
- [x] `docs/history-commit-map.tsv` 覆盖全部 386 个旧提交，且与新提交一一对应（0 歧义 / 0 未匹配）。
- [x] 门禁与三套测试通过。
- [x] 两个远端分支用 `--force-with-lease` 推送成功，`HEAD == origin/…`。

## Implementation

- 在主工作区执行 `git lfs migrate import --include="docs/deliverables/**,docs/e2e/**" --everything`：`Rewriting commits: 100% (386/386)`，refs 与工作区随之更新。
- 用改写前的主分支持（`765807c`，对象仍可达）与改写后的 `main`（`36dafee`）做逐提交匹配（subject + author date + author 三元组），386/386 全部一一对应，0 歧义、0 未匹配。
- 生成 `docs/history-commit-map.tsv`：3 行文件头（用途、改写范围、列定义）+ 386 行数据。

## Verification

- `git lfs ls-files | wc -l` = 365（改写前 58）。
- 映射表：386 行数据，前 3 行见下；tag `pre-v0-port` 旧 `438ad7d0` → 新 `3c43f1b0` 可在表中查到。
- 门禁：`node quality-gates/run.js` 与 `archkit inspect .` 均 Quality gates passed；三套测试 backend 583 / agent-core 130 / ui 649。
- 强推：`git push --force-with-lease origin main` 与 `... origin docs/zj-fwwb-2026`。

## Related ADRs

- None.
