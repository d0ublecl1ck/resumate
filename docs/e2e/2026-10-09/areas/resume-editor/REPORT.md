# resume-editor E2E 证据

| # | 步骤 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | 准备：造一份有章节/条目的简历 | 200 且生成初始版本 | status=200 id=res_135dbfc13660 base=ver_e7ece11d27aa | PASS | REST POST /resumes + PUT /resumes/{id}/document |
| 2 | A 编辑器三栏渲染 | 结构化编辑/对话与Run/预览 三栏都在 | edit=True chat=True preview=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-editor/02-editor-three-columns.png |
| 3 | A2 章节与条目渲染 | 2 个章节标题输入框 + 条目'条目标题' + 要点 | sectionTitle=2 entryTitle=1 bullet=1 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-editor/03-editor-structured.png |
| 4 | B 有效输入立即标记本地未送达 | 出现「本地未送达」徽标；REST save_state=local_unsynced | badge=1 save_state=committed | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-editor/04-editor-local-unsynced.png |
| 5 | B2 章节下移 | 第一章节标题变化（顺序调换） | before=个人简介E2E1009- after=工作经历 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-editor/05-editor-move-section.png |
| 6 | C 停顿后草稿同步到服务端缓冲 | 徽标「已同步草稿」，REST save_state=synced_draft | badge=1 save_state=synced_draft | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-editor/06-editor-synced-draft.png |
| 7 | D 空闲 10 秒自动保存 | 约 10~15 秒内生成 message=自动保存 的新版本 | 耗时=7.6s messages=['创建简历', 'E2E 初始文档', '自动保存'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-editor/07-editor-autosaved.png |
| 8 | E 手动 flush 生成版本 | 出现 message=手动编辑 的新版本 | messages=['创建简历', 'E2E 初始文档', '自动保存', '手动编辑'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-editor/08-editor-manual-flush.png |
| 9 | F 任意两版对比 | 选中两版后比较区显示两个版本 id 与变更章节 | items=4 filter_items=4 selects=4 compare=版本比较 /  / 比较 ver_21b05173ed50 ↔ ver_d9ec252970aa /  / 手动编辑 /  / 较早：创建简历 /  / 变更章节：基础信息、工作经历 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-editor/10-versions-compare.png |
| 10 | G 恢复某版生成新版本 | 确认后生成 source=restore 的新版本，历史全部保留 | dialog=True before=[('ver_21b05173ed50', 'manual', '创建简历'), ('ver_e7ece11d27aa', 'manual', 'E2E 初始文档'), ('ver_bd0ffcda2b12', 'manual', '自动保存'), ('ver_d9ec252970aa', 'manual', '手动编辑')] after=[('ver_21b05173ed50', 'manual', '创建简历'), ('ver_e7ece11d27aa', 'manual', 'E2E 初始文档'), ('ver_bd0ffcda2b12', 'manual', '自动保存'), ('ver_d9ec252970aa', 'manual', '手动编辑'), ('ver_4212b8644ef1', 'restore', '恢复到 ver_bd0ffcda2b12')] restore_count=1 | PASS |  |
| 11 | 控制台无 JS 异常 | 无 pageerror | pageerror=[] | PASS |  |

合计：11 通过 / 0 失败

简历 id：res_135dbfc13660