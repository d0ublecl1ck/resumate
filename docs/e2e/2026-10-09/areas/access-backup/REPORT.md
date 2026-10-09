# access-backup E2E 证据

| # | 步骤 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | 准备：注册并验邮的隔离账号 | 账号为 e2e-bak-<ts>，非 admin | email=e2e-bak-20261009-145552@example.com userId=user_530140113d44 | PASS | state.json |
| 2 | 准备：账号内数据 | 2 份简历 + 1 JD + 1 事实 | prefix=E2E-BAK-20261009-145552 resumes=2 jd=jd_dee7671d9114 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/state.json |
| 3 | 浏览器登录隔离账号 | 进入工作台（非 admin） | url=http://127.0.0.1:5173/ title=Resumate · 对话式简历工作台 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/01-01-login-user.png |
| 4 | 清理历史同名 PAT | 运行前仅保留本次新建 | cleaned=4 | PASS |  |
| 5 | 打开 /settings/access | 渲染 PAT 区、审计日志区、公共接入能力区 | 含标题=True/True/True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/02-02-access-page.png |
| 6 | PAT 创建弹窗只勾最小 scope | 仅 resume:read | checked=['resume:read'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/03-03-pat-modal-scopes.png |
| 7 | 签发后明文只显示一次 | code 形如 rsm_pat_* 且提示一次性 | secret前缀=rsm_pat_2PSXcZyo 长度=40 一次性提示=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/04-04-pat-secret-once.png |
| 8 | 点击复制并完成关闭弹窗 | 复制成功、弹窗关闭 | copy_ok=True dialogClosed=True | PASS |  |
| 9 | 刷新设置页后明文不再可见 | 页面无明文 secret，列表仍显示 token 名称 | secretInDom=False tokenNameVisible=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/05-05-after-reload.png |
| 10 | REST GET /access/tokens 只见元数据、无明文 | 响应不含 secretOnce 明文，secret 字符串不出现 | status=200 secretInBody=False secretOnce=None fields=['createdAt', 'expiresAt', 'fields', 'id', 'lastUsedAt', 'name', 'purpose', 'resources', 'scopes', 'secretOnce', 'status'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/raw/access-tokens-mine.json |
| 11 | PAT 调用 GET /resumes | 200 且只返回本账号全部简历（PAT 与会话视角一致） | status=200 patCount=16 sessionCount=16 ids==sessionIds:True bodyHead=[{"id":"resume_78a47024b090","title":"E2E-BAK-20261009-145552 简历B","targetRole":"前端工程师","tags":["e2e | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/raw/pat-get-resumes.json |
| 12 | 只读 PAT 调写接口 POST /resumes | 403 SCOPE_INSUFFICIENT，原始 body 留证 | status=403 body={"code":"SCOPE_INSUFFICIENT","message":"访问令牌缺少该操作所需的 scope"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/raw/pat-scope-denied.json |
| 13 | 生成足量审计日志 | PAT 认证 allowed 记录足够触发第二页 | 额外 22 次 GET /resumes | PASS |  |
| 14 | 审计日志列表与 REST 一致 + 时间倒序 | UI 共 N 条 == X-Total-Count；时间列降序 | ui_total=112 rest_total=112 ui_rows=20 descending=True first=10-09 15:03 last=10-09 15:03 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/06-06-logs-list.png |
| 15 | 审计筛选：用途=创建访问令牌 | UI 行全部为该用途，且与 REST 同筛选一致 | ui_purposes={'创建访问令牌'} rest_count=5 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/07-07-logs-filter-purpose.png |
| 16 | 审计筛选：结果=拒绝 | UI 行全部为拒绝（拒绝 + 错误码），且与 REST 同筛选一致 | ui_results=['拒绝SCOPE_INSUFFICIENT', '拒绝TOKEN_REVOKED', '拒绝SCOPE_INSUFFICIENT', '拒绝TOKEN_REVOKED', '拒绝SCOPE_INSUFFICIENT', '拒绝TOKEN_REVOKED', '拒绝SCOPE_INSUFFICIENT'] ui_rows=7 rest_count=7 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/08-08-logs-filter-result.png |
| 17 | 审计筛选：关键字 | UI 命中该 client 的记录，且与 REST 同筛选一致 | ui_clients={'E2E-BAK-20261009-145552 只读Token-150305'} ui_rows=20 rest_count=20 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/09-09-logs-filter-keyword.png |
| 18 | 审计日志分页 | 第 1/N 页可下一页，第 2/N 页可上一页（N>=2） | page1=第 1 / 6 页 nextEnabled=True page2=第 2 / 6 页 prevEnabled=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/11-11-logs-page2.png |
| 19 | 审计日志无时间范围筛选参数 | 接口仅 purpose/result/q/page/size（记 FAIL 缺口） | OpenAPI /access/logs 参数 = purpose,result,q,page,size | FAIL | openapi.json |
| 20 | UI 撤销 PAT | 状态变已撤销，撤销按钮消失 | cardText=E2E-BAK-20261009-145552 只读Token-150305 /  / 已撤销 / resume:read /  / 资源：全部简历 · 到期 2027-01-07 · 上次使用 2026-10-09 revokedButton=0 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/12-12-pat-revoked.png |
| 21 | 撤销后再用同一 PAT 调用 | 401 TOKEN_REVOKED，原始 body 留证 | status=401 body={"code":"TOKEN_REVOKED","message":"访问令牌已撤销"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/raw/pat-after-revoke.json |
| 22 | 撤销后审计出现撤销记录 | 用途=撤销访问令牌 至少 1 行 | rows=5 purposes={'撤销访问令牌'} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/13-13-logs-after-revoke.png |
| 23 | 打开 /settings/backup | 渲染导出区与导入区 | exportTitle=True importTitle=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/14-20-backup-page.png |
| 24 | UI 导出 JSON（权威） | 下载成功，ownerId=本人，简历集合与本人一致（不含他人） | format=resumate-backup/1.0 ownerOk=True resumes=16 sessionResumes=16 ids==myRest:True jdTitles=['E2E-BAK-20261009-145552 岗位', 'E2E-BAK-20261009-145552 岗位', 'E2E-BAK-20261009-145552 岗位', 'E2E-BAK-20261009-145552 岗位', 'E2E-BAK-20261009-145552 岗位', 'E2E-BAK-20261009-145552 岗位', 'E2E-BAK-20261009-145552 岗位', 'E2E-BAK-20261009-145552 岗位'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/exported-backup.json |
| 25 | UI 导出 Markdown 索引 | 结构可读：标题/Profile/简历/岗位/版本总数 | mdOk=True hasSections=True head=# Resumate 备份索引 /  / - 格式：resumate-backup/1.0 / - 导出时间：2026-10-09T | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/exported-backup.md |
| 26 | 导入损坏 JSON | 提示无法解析备份文件 | 提示可见=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/corrupt.json |
| 27 | 导入结构非法 JSON（版本错） | UI 展示后端业务校验原文且 REST 一致 | uiMsg=True restStatus=422 restBody={"code":"VALIDATION_FAILED","message":"不支持的备份格式版本：'nope'"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/raw/import-preview-bad-version.json |
| 28 | 导入预览（合法备份） | 展示新增/不覆盖统计与资源清单 | dlgHead=导入预览 /  / 格式 resumate-backup/1.0 · 简历 16 / 版本 16 / 个人资料 1 / 事实 8 / 岗位 8 /  / 将新增的资源 /  / 个人资料 · 我的职业事实库 / 简历 · E2E-BAK-20261009-145552 简历B / 简历 · E2E-BAK-20261009-145552 简历A / 简历 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/exported-backup.json |
| 29 | REST 交叉验证 import:preview | status=valid，resumes/jds 计数与导出文件一致 | manifest={'resumes': 16, 'versions': 16, 'profiles': 1, 'facts': 8, 'jds': 8} newResources=25 bindings=0 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/raw/import-preview.json |
| 30 | 确认导入并 REST 交叉验证落库 | 简历 16->32、岗位 8->16，落库数量 + 导出数量 | uiDone=True resumes 16->32 jds 8->16 newTitles=[] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/20-26-import-done.png |
| 31 | 导入后再导出（REST） | resumes=32,jobDescriptions=16,且每份简历 1 个版本,profiles=1 | counts={'profiles': 1, 'resumes': 32, 'resumeVersions': 32, 'jobDescriptions': 16} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/raw/final-export.json |
| 32 | 跨账号隔离（只读对照 admin） | 本账号导出的简历 id 与 admin 的零交集 | adminResumes=10 overlap=0 | PASS |  |
| 33 | 缺陷复现：导入预览重复标题触发 React duplicate key | 不应出现 duplicate key 警告（导入允许同名资源，key 必须含 id） | dupKeyWarnings=42 示例=error: Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may ca | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/raw/console.log |
| 34 | 控制台错误盘点 | 除字体 403、无头剪贴板权限拒绝、已知 duplicate key 外无其它错误 | errors=93 fontNoise=50 clipboardDenied=1 dupKey=42 other=[] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/access-backup/raw/console.log |

合计：32 通过 / 2 失败

## 缺陷 / 观察

### D1 共享脚手架 e2e_lib.api_login 指向错误路由（工具缺陷，非产品缺陷）
- 现象：e2e_lib.api_login() 与 _login_cookie() 都 POST http://127.0.0.1:8000/login，本实例实际路由是 /auth/login。
- 最小复现：
  1. curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8000/login -H 'Content-Type: application/json' -d '{"email":"admin@resumate.dev","password":"resumate-admin"}' -> 404
  2. 同参数打 http://127.0.0.1:8000/auth/login -> 200
- 影响：任何直接调用 api_login 的子代理都会失败。我已在 access_backup_seed.py 内自带 login_cookie 绕开，未改共享文件。

### D2 审计日志无「时间范围」筛选（需求/实现差异，记 FAIL 缺口）
- 需求要求审计按「动作/结果/时间」筛选；实际 /access/logs 只接受 purpose / result / q / page / size，没有起止时间参数。
- 证据：backend/app/modules/access/api.py:46；OpenAPI /access/logs 参数列表。
- 现状：仅能按时间倒序浏览，无法按时间区间过滤。非崩溃缺陷。

### D3 PAT 列表不返回 token_prefix（低风险观察）
- PersonalAccessToken 存了 token_prefix（backend/app/modules/access/service.py:117），但 PersonalAccessTokenResponse 未暴露该字段。
- 影响：列表只能看到 name/id/scope/时间，无法区分同名 token 的前缀；安全上不泄露明文，属暴露不足而非泄露。

### D4 复制按钮未处理剪贴板拒绝（低severity健壮性观察）
- access-panel.tsx 复制按钮写作 void navigator.clipboard?.writeText(secret)，没有 catch；无头环境剪贴板权限被拒时浏览器报 pageerror: Failed to execute 'writeText' on 'Clipboard': Write permission denied.
- 影响：真实浏览器用户若拒绝剪贴板权限，点击「复制」无任何反馈且控制台抛未处理 rejection；明文仍只在弹窗内一次可见。
- 复现：无头 Playwright 打开签发弹窗点「复制」，采集 pageerror（本报告控制台步骤的 clipboardDenied 计数）。

### D5 导入预览列表 React key 冲突（真实前端缺陷，已最小化复现）
- 现象：备份里存在两份同名资源时，导入预览「将新增的资源」列表触发 React 控制台 error：Encountered two children with the same key ...。
- 根因：ui/src/components/backup-panel.tsx:219 用 key={resource.type + resource.title}；导入设计明确允许同名资源（界面原文「同名资源不会被合并或覆盖，导入始终创建新资源并重新映射 ID」），所以 type+title 不唯一。
- 最小复现：见 areas/access-backup/minimal-repro-dupkey.md；上传仅含两份同标题 Resume 的合法备份即可稳定复现。
- 证据：raw/console.log、minimal-repro-dupkey.md、minimal-repro-dupkey-*.png。
- 影响：列表项身份不稳定，React 可能重复或漏渲染；不影响导入落库（REST 计数正确）。

### 环境噪声
- 期间后端进程被并发工作流重启过一次（uvicorn PID 75376 -> 85266），脚本内 REST 调用已加重试；不影响结论。
- 本 area 账号在修复脚本后的重跑中发生过一次真实导入，final-export 计数断言已改为相对值；证据以最终这次运行为准。
