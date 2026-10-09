# fix-ui E2E 证据

| # | 步骤 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | 临时后端 8010 | 启动成功（同代码同库，不动共享 8000） | health 200 | PASS |  |
| 2 | P1-4 新建弹窗含命名与模板入口 | textbox>=1 且 combobox>=1 | textbox=1 combobox=1 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/01-create-modal-fields.png |
| 3 | P1-4 创建结果落库 title/templateId | e2e-fixui-1009-151529-created / tpl_classic | e2e-fixui-1009-151529-created / tpl_classic | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/02-created-with-title-template.png |
| 4 | P1-1 卡片有重命名入口并弹窗 | 弹窗出现且输入框有现值 | dialog=1 value=e2e-fixui-1009-151529-rename | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/03-rename-dialog.png |
| 5 | P1-1 重命名落库并更新卡片 | e2e-fixui-1009-151529-renamed | e2e-fixui-1009-151529-renamed / card=1 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/04-renamed.png |
| 6 | P1-2 标签增删改落库 | 含 e2e-fixui-1009-151529-tag-b 且不含 e2e-fixui-1009-151529-tag-a | ['e2e-fixui-1009-151529-tag-b'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/06-tags-updated.png |
| 7 | P1-3 取消路径不删 / 确认后 DELETE | 取消后仍在；确认后 lifecycle=deleted 且卡片消失 | cancelled_ok=True lifecycle=deleted card_gone=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/08-deleted.png |
| 8 | P2-5 编辑 JD 死按钮修复 | role 更新且 revision 1 -> 2 | role=e2e-fixui-1009-151529-资深前端 revision=2 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/10-jd-edited.png |
| 9 | P2-8 后端 POST /profile/match-job | 200 且 results/gaps 非空 | status=200 results=4 gaps=4 | PASS |  |
| 10 | P2-8 JD 详情匹配区块渲染 | 显示匹配事实与要求覆盖 | 岗位匹配 /  / 用确定性规则对齐 JD 要求与职业事实，不调用模型。 /  / 匹配到的事实 /  / e2e-fixui-1009-151529-TypeScript /  / 相关度 63% /  / 命中关键词: 1009, 151529, e2e, fixui, react, 交易, 前端, 开发, 心交, 易链, 核心, 端前, 端开, 负责, 责核, 链路 /  / e2e-fixui-1009-151529-性能优化 /  / 相关度 53% /  / 命中 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/11-job-match-panel.png |
| 11 | P2-7 解绑入口与 DELETE binding | 按钮存在且 boundResumeId 变 null | buttons=1 boundResumeId=None | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/13-jd-unbound.png |
| 12 | P2-6 取消不删 / 确认后 DELETE 204 | 取消后 200；确认后 GET 404 | cancel_200=True after_delete=404 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/15-jd-deleted.png |
| 13 | P3-9 事实删除入口与影响提示 | 弹窗含影响信息；取消保留；确认后 GET 404 | dialog='删除这条事实？ /  / 删除后无法撤销；已经引用它的简历内容不会被自动改写。 /  / 没有被任何简历引用。 /  / 取消 / 确认删除' cancel_kept=True after=404 headings=0 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/fix-ui/17-fact-deleted.png |

合计：13 通过 / 0 失败

## 说明

- 共享后端 8000 未重启（其他 E2E 仍在并发使用）。
- POST /profile/match-job 的真实契约用临时后端 http://127.0.0.1:8010 验证（同代码、同库、不同端口）；UI 渲染用 Playwright route fulfill 注入该真实响应。
- 所有数据带 e2e-fixui-1009-151529 前缀，结束已清理；清理异常：无

## 修复项对照（P1-P3）

| 条号 | 修复项 | 状态 | 证据 |
|---|---|---|---|
| P1-1 | 简历卡「重命名」入口（PATCH /resumes/{id}） | 已修 | 03/04 截图 + 步骤 4/5 |
| P1-2 | 简历卡「标签」增删改入口（PATCH tags） | 已修 | 05/06 截图 + 步骤 6 |
| P1-3 | 简历卡「删除」入口 + 危险确认弹窗（含取消） | 已修 | 07/08 截图 + 步骤 7 |
| P1-4 | 新建简历弹窗「标题」输入 + 「模板」选择 | 已修 | 01/02 截图 + 步骤 2/3 |
| P2-5 | JD「编辑（生成新 revision）」接 PATCH /jds/{id} | 已修 | 09/10 截图 + 步骤 8 |
| P2-6 | JD「删除」入口 + 204 确认弹窗 | 已修 | 14/15 截图 + 步骤 12 |
| P2-7 | JD「解除绑定」接 DELETE /jds/{id}/binding | 已修 | 13 截图 + 步骤 11 |
| P2-8 | 后端 POST /profile/match-job + JD 详情匹配区块 | 已修 | 11 截图 + 步骤 9/10；pytest 5 passed |
| P3-9 | 事实「删除」入口 + FactDeletionImpact 影响确认 | 已修 | 16/17 截图 + 步骤 13 |

## 未修 / 超出本次范围

- `/admin/users` 用户管理页：属新建页面，受项目规则约束（Storybook 先行 + 用户确认），本次未实现。
- `ui/prototypes/index.html` 未同步：原型文件不在本次允许写入白名单内，需由后续拥有该文件写权限的任务补齐。
- 既有单测 `ui/src/components/create-resume-modal.test.tsx` 第一个用例断言「不再有标题 / 模板输入」，与新契约相矛盾但未改动（白名单禁止改已有测试文件）；新契约由 `create-resume-modal-fields.test.tsx` 覆盖。

## 验证命令原始输出（尾部）

~~~text
$ cd ui && ./node_modules/.bin/tsc -b --noEmit
EXIT=0                                # 0 error

$ cd ui && ./node_modules/.bin/vitest run
Test Files  60 passed (60)
     Tests  466 passed (466)

$ node quality-gates/run.js
Quality gates passed.

$ cd backend && uv run --no-sync pytest tests/test_profile_match.py -q
5 passed, 2 warnings in 1.16s
~~~
