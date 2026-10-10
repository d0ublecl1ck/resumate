---
id: b5981
status: closed
created_at: 2026-10-10T13:38:22.270Z
updated_at: 2026-10-10T13:39:30.978Z
priority: medium
labels: []
parent: null
blocked_by: []
started_at: 2026-10-10T13:38:36.092Z
closed_at: 2026-10-10T13:39:30.978Z
---

# 纳入交付物成品到 docs/deliverables

## Background

交付给赛题组的成品文件此前只存在于本机桌面目录，仓库内没有可核对、可复现的入库快照。为了让评审与后续维护能在仓库里直接看到提交物本体，需要把方案概要、解决方案、核心内容展示 PPT、演示视频与团队完成过程 PPT 五个成品纳入版本管理，并附一份自包含的目录说明。

## Scope

- 新建 `docs/deliverables/`，按原名入库 5 个成品：`S1-方案概要.pdf`、`S2-解决方案.pdf`、`S3-核心内容展示.pptx`、`S3-演示视频.mp4`、`S5-团队完成过程.pptx`。
- 新增 `docs/deliverables/README.md`：说明目录用途、逐个文件的大小与 sha256、对应官方提交物类别与仓库内生成来源，并说明为何 S4A 源码包与本地知识库资料不在此目录。
- 入库前对 5 个文件做匿名扫描（学校名/教师名/真实姓名/本机路径/handle）。

## Non-goals

- 不入库 `S4A-源码包.zip` 与 `本地知识库资料.zip`（由 `git archive` 与知识库语料脚本生成，不重复入库）。
- 不提交 `docs/competition/` 竞赛材料目录。
- 不修改任何交付物内容（仅做逐字节复制）。

## Acceptance Criteria

- [x] `docs/deliverables/` 下 5 个文件与源文件 sha256 逐项一致。
- [x] `README.md` 自包含、只用仓库内相对路径，无本机绝对路径，无学校名/教师名/真实姓名/handle。
- [x] 匿名扫描对 5 个文件零命中。
- [x] `node quality-gates/run.js` 与 `archkit inspect .` 通过。
- [x] 提交只包含 `docs/deliverables/` 下的文件与本次 Issue 文档，提交信息带且仅带一个 `Issue: b5981` trailer。
- [x] 关单后 `git push origin docs/zj-fwwb-2026` 成功且 `HEAD == origin/docs/zj-fwwb-2026`。

## Implementation

- 新增 `docs/deliverables/`，逐字节复制 5 个成品：`S1-方案概要.pdf`、`S2-解决方案.pdf`、`S3-核心内容展示.pptx`、`S3-演示视频.mp4`、`S5-团队完成过程.pptx`；复制后 sha256 与来源逐项一致。
- 新增 `docs/deliverables/README.md`：文件清单（字节数、sha256、对应官方提交物、生成来源）、不含 `S4A-源码包.zip` 与 `本地知识库资料.zip` 的原因、维护约定；只用仓库内相对路径。
- 未入库 S4A 源码包与本地知识库资料（两者是可复现产物）；未提交 `docs/competition/`。

## Verification

- 匿名扫描（PDF 用 `pdftotext -enc UTF-8`，PPTX 用 `unzip -p`，MP4 用 `strings -a`；模式含学校名、教师名、真实姓名、handle 与本机路径）：5 个文件全部零命中。
- `node quality-gates/run.js` → Quality gates passed（known stubs: 0）。
- `archkit inspect .` → Quality gates passed。
- 5 个文件 sha256 与来源逐项一致：fb934a6e…、0b163872…、dc5fc6e8…、c79ce31c…、0d1509f9…。

## Related ADRs

- None.
