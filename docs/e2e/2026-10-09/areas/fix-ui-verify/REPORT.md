# fix-ui 修复项：父代理独立复验（真实后端 8000 + 无头浏览器）

脚本：`scripts/fix_ui_verify.py`（V1–V6）、`scripts/v7_resume_delete_check.py`（V7）
后端在复验前已重启以加载新增的 `POST /profile/match-job`。

| # | 步骤 | 预期 | 实际 | 结果 | 截图 |
|---|---|---|---|---|---|
| V1 | 简历卡「重命名」 | 弹窗保存后 REST title 变更 | 按钮存在，REST.title=E2E复验改名-1009-151947 | PASS | 01-v1-renamed.png |
| V2 | 简历卡「编辑标签」 | 保存后 REST tags 含新标签 | 按钮存在，tags=['E2E标签1009-151947'] | PASS | 02-v2-tags.png |
| V3 | JD「编辑（生成新 revision）」 | 弹窗保存后 revision 递增 | 按钮存在，rev 1→2 | PASS | 03-v3-jd-edited.png |
| V4 | JD 详情「岗位匹配」区块 + 解除绑定 | 区块渲染；解绑后 REST 绑定为空 | 区块=1、按钮存在、boundResumeId=None | PASS | 04-v4-match-unbind.png |
| V5 | JD 删除 | 确认后 GET /jds/{id} 404 | 删除按钮存在，404 | PASS | 05-v5-jd-deleted.png |
| V6 | Profile 事实删除 | 确认后 GET /profile/facts/{id} 404 | 删除按钮存在（aria-label 删除「标题」），404 | PASS | 06-v6-fact-deleted.png |
| V7 | 简历卡删除 | 确认后 lifecycle=deleted | 删除按钮存在，lifecycle=deleted | PASS | 01-v7-resume-deleted.png |

合计：7 通过 / 0 失败。控制台无 pageerror。

说明：`POST /profile/match-job` 真实契约另经 REST 复核：带真实 JD id 返回 200 + `{results,gaps}`（results[0].relevance=0.183、gaps[0].status=partial），未知 JD 返回 404；测试 JD 已删除。
