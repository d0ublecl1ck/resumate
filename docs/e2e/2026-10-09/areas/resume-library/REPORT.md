# resume-library E2E 证据

| # | 步骤 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | 打开 /resumes 简历库 | 标题「简历库」，有「新建简历」与活跃/归档 Tab | h1=简历库；卡片数=12；活跃Tab=1 归档Tab=1 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/01-01-library-loaded.png |
| 2 | 新建弹窗结构 | 弹窗含标题与创建方式 | 开始一份新的简历 /  / 从现有简历复制，或完全新开一份空白简历。 /  / 创建方式 / 从现有简历复制 / 内容原样复制成新简历，标题自动加「（副本）」 / 完全新开 / 创建空白简历，标题与模板用默认值，建好再改 / 取消 / 创建 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/02-02-create-modal.png |
| 3 | 新建弹窗：命名入口 | 存在标题输入框以命名新简历 | textbox=0 combobox=0 | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/02-02-create-modal.png |
| 4 | 新建弹窗：选模板入口 | 存在模板选择控件（select/combobox/模板卡片） | select=0 combobox=0 | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/02-02-create-modal.png |
| 5 | 新建后出现在列表 | 列表出现「e2e-lib-1009-145907-create」 | titles=['e2e-lib-1009-145907-create', 'e2e-jd-profile-20261009-145802-简历-bind', 'e2e-editor-1009-145736', 'e2e-jd-profile-20261009-145648-简历-bind', 'e2e-editor-1009-145615', 'e2e-jd-profile-20261009-145610-简历-bind', 'e2e-editor-1009-145547', 'e2e-editor-1009-145543', 'e2e-editor-1009-145434', '未命名简历（副本）', 'T-卡片复制-源（副本）', 'T-卡片复制-源', 'Agent 烟测（可删）'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/03-03-created-in-list.png |
| 6 | REST 交叉验证新建记录 | GET /resumes 含该 id 且标题一致 | status=200 found=[{"id": "res_24831dc2743e", "title": "e2e-lib-1009-145907-create", "targetRole": "", "tags": [], "templateId": "tpl_modern", "templateVersion": 1, "currentVersionId": "ver_c44156dfd464", "lifecycle": "active", "saveState": "committed", "updatedAt": "2026-10-09T14:59:18.296383+08:00", "boundByJdIds": | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/03-03-created-in-list.png |
| 7 | 点「复制」生成副本 | 副本标题为「e2e-lib-1009-145907-create（副本）」，id 与原记录不同 | clone_id=res_0f9363327a79 title=e2e-lib-1009-145907-create（副本） | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/04-04-duplicate-editor.png |
| 8 | 副本出现在列表 | 列表同时有原记录与副本 | titles=['e2e-lib-1009-145907-create（副本）', 'e2e-lib-1009-145907-create', 'e2e-jd-profile-20261009-145802-简历-bind', 'e2e-editor-1009-145736', 'e2e-jd-profile-20261009-145648-简历-bind', 'e2e-editor-1009-145615', 'e2e-jd-profile-20261009-145610-简历-bind', 'e2e-editor-1009-145547', 'e2e-editor-1009-145543', 'e2e-editor-1009-145434', '未命名简历（副本）', 'T-卡片复制-源（副本）', 'T-卡片复制-源', 'Agent 烟测（可删）'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/05-05-duplicate-in-list.png |
| 9 | 副本内容独立 | 改副本内容后原记录不变（初始文档相同、改动互不影响） | 初始相同=True；改副本后原记录 full_name='' | PASS |  |
| 10 | UI 重命名入口 | 卡片上可重命名简历 | 卡片按钮=['复制', '归档']；重命名按钮=0；input=0 | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/06-06-card-actions.png |
| 11 | UI 标签增删改入口 | 卡片上可编辑标签 | 标签按钮=0；input=0 | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/06-06-card-actions.png |
| 12 | REST 改名+标签后 UI 反映 | 卡片标题与两个标签 chip 都显示 | 标签文本=['e2e-lib-1009-145907-tag-a', 'e2e-lib-1009-145907-tag-b'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/07-07-rename-tags-applied.png |
| 13 | 标签 chip 筛选 | 点 tag-a 后只显示带该标签的「e2e-lib-1009-145907-meta-renamed」 | titles=['e2e-lib-1009-145907-meta-renamed'] url=http://127.0.0.1:5173/resumes?tag=e2e-lib-1009-145907-tag-a | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/08-08-tag-chip-filter.png |
| 14 | 标签删/增后 UI 反映 | tag-a chip 消失，tag-b/tag-c chip 存在 | chip_a=0 chip_b=1 chip_c=1 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/09-09-tags-removed-added.png |
| 15 | 归档后离开活跃列表 | 活跃列表不再含「e2e-lib-1009-145907-create」，REST archived 含它 | active_ui=['e2e-lib-1009-145907-meta-renamed', 'e2e-lib-1009-145907-create（副本）', 'e2e-jd-profile-20261009-145802-简历-bind', 'e2e-editor-1009-145736', 'e2e-jd-profile-20261009-145648-简历-bind', 'e2e-editor-1009-145615', 'e2e-jd-profile-20261009-145610-简历-bind', 'e2e-editor-1009-145547', 'e2e-editor-1009-145543', 'e2e-editor-1009-145434', '未命名简历（副本）', 'T-卡片复制-源（副本）', 'T-卡片复制-源', 'Agent 烟测（可删）']；archived_rest=['e2e-lib-1009-145907-create'] | PASS |  |
| 16 | 归档列表可见 | 归档 Tab 显示「e2e-lib-1009-145907-create」并带「已归档」徽标 | titles=['e2e-lib-1009-145907-create'] badge=1 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/10-10-archived-tab.png |
| 17 | 恢复回到正常列表 | 归档 Tab 不再含它，活跃 Tab/ REST active 重新含它 | archived_ui=[]；active_ui=['e2e-lib-1009-145907-create', 'e2e-lib-1009-145907-meta-renamed', 'e2e-lib-1009-145907-create（副本）', 'e2e-jd-profile-20261009-145802-简历-bind', 'e2e-editor-1009-145736', 'e2e-jd-profile-20261009-145648-简历-bind', 'e2e-editor-1009-145615', 'e2e-jd-profile-20261009-145610-简历-bind', 'e2e-editor-1009-145547', 'e2e-editor-1009-145543', 'e2e-editor-1009-145434', '未命名简历（副本）', 'T-卡片复制-源（副本）', 'T-卡片复制-源', 'Agent 烟测（可删）'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/11-11-restored-active.png |
| 18 | UI 删除入口/确认弹窗 | 卡片上有「删除」按钮并能弹出确认 | 删除按钮数=0（点击前后均无 confirm dialog） | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/12-12-no-delete-control.png |
| 19 | 删除后列表与 REST 均消失 | UI 无该卡片；REST active 与默认列表都不含它 | rest_active_has=False；rest_default_has=False；ui_has=False | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/13-13-deleted-gone.png |
| 20 | 搜索命中 | 关键词「e2e-lib-1009-145907-meta-renamed」只命中该卡片 | titles=['e2e-lib-1009-145907-meta-renamed'] url=http://127.0.0.1:5173/resumes?q=e2e-lib-1009-145907-meta-renamed | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/14-14-search-hit.png |
| 21 | 搜索大小写不敏感 | 大写关键词同样命中 | titles=['e2e-lib-1009-145907-meta-renamed'] | PASS |  |
| 22 | 搜索未命中空态 | 显示「没有匹配的简历」筛选空态且无卡片 | cards=[]；空态标题命中=1；url=http://127.0.0.1:5173/resumes?q=e2e-lib-zzz-000-no-match | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/15-15-search-miss-empty.png |
| 23 | 清空搜索 | 清空后恢复当前 Tab 全部卡片，URL 去掉 q | cards=['e2e-lib-1009-145907-create', 'e2e-lib-1009-145907-meta-renamed', 'e2e-lib-1009-145907-create（副本）', 'e2e-jd-profile-20261009-145802-简历-bind', 'e2e-editor-1009-145736', 'e2e-jd-profile-20261009-145648-简历-bind', 'e2e-editor-1009-145615', 'e2e-jd-profile-20261009-145610-简历-bind', 'e2e-editor-1009-145547', 'e2e-editor-1009-145543', 'e2e-editor-1009-145434', '未命名简历（副本）', 'T-卡片复制-源（副本）', 'T-卡片复制-源', 'Agent 烟测（可删）']；url=http://127.0.0.1:5173/resumes；REST active=['e2e-lib-1009-145907-create', 'e2e-lib-1009-145907-meta-renamed', 'e2e-lib-1009-145907-create（副本）', 'e2e-jd-profile-20261009-145802-简历-bind', 'e2e-editor-1009-145736', 'e2e-jd-profile-20261009-145648-简历-bind', 'e2e-editor-1009-145615', 'e2e-jd-profile-20261009-145610-简历-bind', 'e2e-editor-1009-145547', 'e2e-editor-1009-145543', 'e2e-editor-1009-145434', '未命名简历（副本）', 'T-卡片复制-源（副本）', 'T-卡片复制-源', 'Agent 烟测（可删）'] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/16-16-search-cleared.png |
| 24 | 活跃 Tab 与 REST 一致 | 活跃 Tab 卡片集合 == REST ?lifecycle=active | ui=['e2e-lib-1009-145907-create', 'e2e-lib-1009-145907-meta-renamed', 'e2e-lib-1009-145907-create（副本）', 'e2e-jd-profile-20261009-145802-简历-bind', 'e2e-editor-1009-145736', 'e2e-jd-profile-20261009-145648-简历-bind', 'e2e-editor-1009-145615', 'e2e-jd-profile-20261009-145610-简历-bind', 'e2e-editor-1009-145547', 'e2e-editor-1009-145543', 'e2e-editor-1009-145434', '未命名简历（副本）', 'T-卡片复制-源（副本）', 'T-卡片复制-源', 'Agent 烟测（可删）']；rest=['e2e-lib-1009-145907-create', 'e2e-lib-1009-145907-meta-renamed', 'e2e-lib-1009-145907-create（副本）', 'e2e-jd-profile-20261009-145802-简历-bind', 'e2e-editor-1009-145736', 'e2e-jd-profile-20261009-145648-简历-bind', 'e2e-editor-1009-145615', 'e2e-jd-profile-20261009-145610-简历-bind', 'e2e-editor-1009-145547', 'e2e-editor-1009-145543', 'e2e-editor-1009-145434', '未命名简历（副本）', 'T-卡片复制-源（副本）', 'T-卡片复制-源', 'Agent 烟测（可删）'] | PASS |  |
| 25 | 归档 Tab 与 REST 一致 | 归档 Tab 卡片集合 == REST ?lifecycle=archived | ui=[]；rest=[] | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/17-17-archived-consistency.png |
| 26 | 筛选维度覆盖 | 当前简历库只有「活跃/归档」两个 Tab（无全部/草稿） | 活跃Tab=True 归档Tab=True 草稿Tab存在=False 全部Tab存在=False | PASS |  |
| 27 | 归档空态文案与插画 | 显示「暂无归档简历」+ 说明 + 插画 | 标题=1 说明=1 卡片=0 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/18-18-archived-empty-state.png |
| 28 | 空列表空态文案与插画 | 全新用户看到「还没有简历」+ 说明 + 插画，且无卡片 | 标题=1 说明=1 卡片=0 图形元素=14 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/resume-library/19-19-empty-library.png |

合计：23 通过 / 5 失败

## 环境与口径

- 测试前缀 BASE=e2e-lib-1009-145907；前端 http://127.0.0.1:5173；后端 http://127.0.0.1:8000；无头 chromium locale=zh-CN
- 脚手架 e2e_lib.api_login 打的是 POST /login，实际后端登录是 POST /auth/login（会 404）；本脚本用自带 api_cookie 登录。
- 已软删除本次创建的 3 条 e2e-lib 记录（前缀 e2e-lib-1009-145907）

## 缺陷

### 新建简历弹窗缺少「命名」输入框，无法在创建时命名

最小复现：/resumes → 点「新建简历」→ 弹窗只有「从现有简历复制 / 完全新开」两个 button[aria-pressed]，dialog 内 textbox=0、combobox=0、select=0。选「完全新开」→「创建」后标题固定为「未命名简历」。证据：areas/resume-library/02-02-create-modal.png；文案键 resume.create.defaultTitle 值即「未命名简历」。

### 新建简历弹窗缺少「选模板」入口

最小复现：/resumes → 「新建简历」→ 弹窗内没有任何模板选择控件；后端 POST /resumes 支持 templateId，UI 固定用 usableTemplates[0].id（当前 tpl_modern）。证据：areas/resume-library/02-02-create-modal.png。

### 简历库卡片缺少「重命名」与「标签编辑」入口

最小复现：/resumes 任一卡片操作区只有「打开编辑 / 版本历史 / 复制 / 归档」四种按钮，卡片内无 input、无重命名按钮，标签仅只读展示。后端 PATCH /resumes/{id} 支持 title/tags（本次已用 REST 验证）。证据：areas/resume-library/06-06-card-actions.png。

### 简历库没有「删除」入口，也没有确认/取消路径

最小复现：/resumes 任一卡片操作区只有「打开编辑 / 版本历史 / 复制 / 归档」，card.get_by_role('button', name='删除') 命中 0；因此无法触发确认弹窗，也没有取消路径可测。后端 DELETE /resumes/{id} 存在并可用（软删除，lifecycle=deleted，30 天恢复窗口）。证据：areas/resume-library/12-12-no-delete-control.png。


## REST 原始输出

### REST 基线 GET /resumes

~~~
status=200 count=12 ids=['res_2919a95f1aa5', 'res_59ee2e58292b', 'res_71efbbef213f', 'res_84e8a241a460', 'res_a898caa7011c', 'res_a96579660f59', 'res_aeba1b686aa4', 'res_b0a56069b7b7', 'res_bed7df750e8d', 'res_d5a6cc378080', 'res_edf7bb6f773e', 'res_f3c41f1df228']
~~~
### UI 新建后进入编辑器

~~~
url=http://127.0.0.1:5173/resumes/res_24831dc2743e id=res_24831dc2743e
~~~
### REST GET /resumes（新建后）

~~~
status=200 new_ids=['res_24831dc2743e']
~~~
### REST PATCH /resumes/res_24831dc2743e 改名

~~~
status=200 title=e2e-lib-1009-145907-create
~~~
### REST 复制结果 GET /resumes/res_0f9363327a79

~~~
status=200 title=e2e-lib-1009-145907-create（副本）
~~~
### REST 副本独立性验证

~~~
clone_doc==orig_doc(初始)=True；PUT clone status=200；orig full_name 仍=''
~~~
### REST POST /resumes title=e2e-lib-1009-145907-meta

~~~
status=201 body={"id": "res_c40733bebc6f", "title": "e2e-lib-1009-145907-meta", "targetRole": "", "tags": ["e2e-lib-1009-145907-tag-a"], "templateId": "tpl_modern", "templateVersion": 1, "currentVersionId": "ver_1fe4ab3d1538", "lifecycle": "active", "saveState": "committed", "updatedAt": "2026-10-09T14:59:26.645910+08:00", "boundByJdIds": [], "restoreDeadline": null, "profileId": null, "document": {"basics": {"fullName": "", "headline": "", "email": "", "phone": "", "location": "", "links": []}, "sections": []}, "draft": null, "versions": [{"id": "ver_1fe4ab3d1538", "source": "manual", "actorId": "user_admin", "message": "创建简历", "changeCount": 1, "affectedSections": ["基础信息"], "startedAt": "2026-10-09T14:59:26.645910+08:00", "committedAt": "2026-10-09T14:59:26.645910+08:00", "parentVersionId": null, "baseVersionId": null, "clientId": null, "conversationId": null, "userTurnId": null, "agentRunId": null, "executionMode": null}]}
~~~
### REST PATCH 改名+加标签

~~~
status=200 title=e2e-lib-1009-145907-meta-renamed tags=['e2e-lib-1009-145907-tag-a', 'e2e-lib-1009-145907-tag-b']
~~~
### REST PATCH 删 tag-a / 增 tag-c

~~~
status=200 tags=['e2e-lib-1009-145907-tag-b', 'e2e-lib-1009-145907-tag-c']
~~~
### REST 归档后交叉验证

~~~
archived=["e2e-lib-1009-145907-create"]
~~~
### REST 恢复后交叉验证

~~~
active_titles=["e2e-lib-1009-145907-create", "e2e-lib-1009-145907-meta-renamed", "e2e-lib-1009-145907-create（副本）", "e2e-jd-profile-20261009-145802-简历-bind", "e2e-editor-1009-145736", "e2e-jd-profile-20261009-145648-简历-bind", "e2e-editor-1009-145615", "e2e-jd-profile-20261009-145610-简历-bind", "e2e-editor-1009-145547", "e2e-editor-1009-145543", "e2e-editor-1009-145434", "未命名简历（副本）", "T-卡片复制-源（副本）", "T-卡片复制-源", "Agent 烟测（可删）"]
~~~
### REST POST /resumes title=e2e-lib-1009-145907-del

~~~
status=201 body={"id": "res_a86bc67cfde0", "title": "e2e-lib-1009-145907-del", "targetRole": "", "tags": [], "templateId": "tpl_modern", "templateVersion": 1, "currentVersionId": "ver_b17dba7cd8d8", "lifecycle": "active", "saveState": "committed", "updatedAt": "2026-10-09T14:59:49.884805+08:00", "boundByJdIds": [], "restoreDeadline": null, "profileId": null, "document": {"basics": {"fullName": "", "headline": "", "email": "", "phone": "", "location": "", "links": []}, "sections": []}, "draft": null, "versions": [{"id": "ver_b17dba7cd8d8", "source": "manual", "actorId": "user_admin", "message": "创建简历", "changeCount": 1, "affectedSections": ["基础信息"], "startedAt": "2026-10-09T14:59:49.884805+08:00", "committedAt": "2026-10-09T14:59:49.884805+08:00", "parentVersionId": null, "baseVersionId": null, "clientId": null, "conversationId": null, "userTurnId": null, "agentRunId": null, "executionMode": null}]}
~~~
### REST DELETE /resumes/res_a86bc67cfde0

~~~
status=200 lifecycle=deleted
~~~
### REST GET 已删除记录

~~~
status=200
~~~
### REST 清理 DELETE /resumes/res_24831dc2743e

~~~
title=e2e-lib-1009-145907-create status=200
~~~
### REST 清理 DELETE /resumes/res_c40733bebc6f

~~~
title=e2e-lib-1009-145907-meta-renamed status=200
~~~
### REST 清理 DELETE /resumes/res_0f9363327a79

~~~
title=e2e-lib-1009-145907-create（副本） status=200
~~~
### REST POST /auth/register

~~~
status=202 body={"status": "verification_sent", "email": "e2e-lib-empty-1009-145907@example.com"}
~~~
### REST POST /auth/verification/verify

~~~
status=200 body={"id": "user_2e862823bb55", "email": "e2e-lib-empty-1009-145907@example.com", "displayName": "E2E 空态用户", "role": "user", "roles": ["user"], "permissions": ["access:read", "access:write", "account:read", "account:write", "backup:read", "backup:write", "jd:read", "jd:write", "profile:read", "profile:write", "resume:read", "resume:write", "settings:read", "settings:write"], "isBanned": false, "createdAt": "2026-10-09T15:00:18.408900+08:00"}
~~~
### REST 新用户 GET /resumes

~~~
status=200 count=0
~~~