---
id: ef128
status: in-progress
created_at: 2026-10-11T04:34:00.000Z
updated_at: 2026-10-11T04:34:26.107Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-11T04:34:26.107Z
---

# 竞赛过程材料入库并启用 Git LFS

## Background

竞赛过程材料（PPTD 源工程、语料、测试与门禁记录、演示视频与截图等，约 61 MB / 106 个文件）此前只存在于本机工作区、未被 Git 跟踪。用户要求把这些过程材料纳入版本管理，并让大文件走 Git LFS，避免仓库体积失控。材料里含学校名、教师名、真实姓名、作者句柄与本机家目录路径，入库前必须先做匿名清洗。

## Scope

- 清洗 4 个文件里的身份线索：`docs/competition/zj-fwwb-2026/sync-deliverables.sh`（把实名/句柄匹配字面量改为从同目录、不纳入版本管理的 `patterns.local` 读取，缺失时退回通用兜底模式）、`prompts/S3-核心内容展示-PPT-prompt.md` 与两份 `测试与质量/logs/*.txt`（改为中性占位）。
- 启用 Git LFS（`git lfs install`）并新增 `.gitattributes`，声明 mp4 / pptx / pdf / zip / rar / png / jpg / jpeg / webp 走 LFS。
- 把 `docs/competition/` 纳入版本管理，并按 ArchKit 流程提交、关单、推送、合并进 main。

## Non-goals

- 不迁移已入库的 `docs/deliverables/` 与 `docs/e2e/` 二进制（迁移 LFS 需要改写历史，另行决定）。
- 不改业务代码、测试与门禁逻辑（只做清洗所需的最小文本替换）。
- 不把 `patterns.local` 纳入版本管理。

## Acceptance Criteria

- [ ] 4 个文件清洗完成；身份线索与家目录绝对路径在全量复扫中零命中（`patterns.local` 除外，已加入 .gitignore）。
- [ ] `.gitattributes` 声明 9 类大文件走 LFS；`git lfs ls-files` 覆盖 `docs/competition/` 下的媒体文件。
- [ ] `node quality-gates/run.js` 与 `archkit inspect .` 通过。
- [ ] 提交只包含 `docs/competition/`、`.gitignore`、`.gitattributes` 与 LFS hooks，提交信息带且仅带一个 `Issue: ef128` trailer。
- [ ] 合并进 main 后 backend / agent-core / ui 三套测试通过，且 `HEAD == origin/main`。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
