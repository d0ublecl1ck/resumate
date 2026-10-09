# settings-rbac E2E 证据

| # | 步骤 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | [设置偏好] REST 登录自建主账号 | 200 且 role=user | status=200 role=user | PASS |  |
| 2 | [设置偏好] 浏览器登录并进入工作台 | URL 为 / 且显示工作台 | ok=True err= url=http://127.0.0.1:5173/ | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/01-prefs-01-login-workbench.png |
| 3 | [设置偏好] 打开设置页 | 渲染出「个人偏好」分区 | 已渲染「个人偏好」 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/02-prefs-02-settings-loaded.png |
| 4 | [设置偏好] 编辑偏好（改名/深色/关自动保存/间隔30/默认模板现代双栏） | 表单接受输入 | theme=dark autosave=false interval=30 template=tpl_modern | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/03-prefs-03-edited-form.png |
| 5 | [设置偏好] 点击「保存偏好」 | 出现「已保存」 | 已出现「已保存」 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/04-prefs-04-saved.png |
| 6 | [设置偏好] REST 交叉验证 GET /settings | theme=dark autosave=false interval=30 template=tpl_modern 名称已改 | {"theme": "dark", "language": "zh-CN", "displayName": "E2E 主账号-改名", "autosave": false, "autosaveIntervalSeconds": 30, "defaultTemplateId": "tpl_modern", "defaultTemplateRetired": false, "shortcuts": [{"action": "save_flush", "keys": "⌘ S", "conflict": null}, {"action": "send_message", "keys": "⌘ ↵", "conflict": null}, {"action": "open_history", "keys": "⌘ H", "conflict": null}, {"action": "accept_all_diff", "keys": "⌘ ⇧ A", "conflict": null}]} | PASS | areas/settings-rbac/raw-prefs-after-save.json |
| 7 | [设置偏好] 主题即时生效 | <html> 带 dark class | dark=True | PASS |  |
| 8 | [设置偏好] 刷新后偏好回显 | 深色/改名/关自动保存/30/现代双栏 全部保留 | theme=dark name=E2E 主账号-改名 autosave=false interval=30 tpl=tpl_modern dark=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/05-prefs-05-after-reload.png |
| 9 | [设置偏好] 切换语言为 English | REST language=en 且 <html lang>=en | language=en html.lang=en | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/06-prefs-06-lang-en.png |
| 10 | [设置偏好] 刷新后语言仍为 English | <html lang>=en 且 localStorage=en | html.lang=en localStorage=en | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/07-prefs-07-lang-en-reload.png |
| 11 | [设置偏好] 切回简体中文 | REST language=zh-CN 且 <html lang>=zh-CN | language=zh-CN html.lang=zh-CN | PASS |  |
| 12 | [设置偏好] 还原主题/自动保存为默认 | theme=paper autosave=true interval=10 | theme=paper autosave=True interval=10 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/08-prefs-08-restored.png |
| 13 | [Agent 配置] 浏览器登录主账号 | 进入工作台 | ok=True err= | PASS |  |
| 14 | [Agent 配置] 读取 Agent 配置（初始） | nextRunMode=approval, budget=20000/8/0.5 | status=200 {"currentRunMode": null, "nextRunMode": "approval", "modeSource": "account", "fullAccessScopes": ["read_search_compare_render", "content_patch", "metadata_update_archive"], "confirmRetainedOps": ["delete", "history_restore", "overwrite_export", "profile_to_resume", "fact_promotion"], "budget": {"maxTokens": 20000, "maxTurns": 8, "maxCostUsd": 0.5}} | PASS |  |
| 15 | [Agent 配置] 默认选中 Approval 模式 | Approval 按钮 aria-pressed=true, Full Access=false | approval=true full=false | PASS |  |
| 16 | [Agent 配置] 切换到 Full Access | 按钮 aria-pressed 翻转且出现免确认范围说明 | full=true notice=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/01-agent-01-full-access-selected.png |
| 17 | [Agent 配置] 保存 Agent 配置（full_access, 50000/12/2.5） | 出现「已保存」 | 已出现「已保存」 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/02-agent-02-saved.png |
| 18 | [Agent 配置] REST 交叉验证 GET /agent/config | full_access, 50000/12/2.5 | {"currentRunMode": null, "nextRunMode": "full_access", "modeSource": "account", "fullAccessScopes": ["read_search_compare_render", "content_patch", "metadata_update_archive"], "confirmRetainedOps": ["delete", "history_restore", "overwrite_export", "profile_to_resume", "fact_promotion"], "budget": {"maxTokens": 50000, "maxTurns": 12, "maxCostUsd": 2.5}} | PASS | areas/settings-rbac/raw-agent.json |
| 19 | [Agent 配置] 刷新后 Agent 配置回显 | Full Access 选中且 50000/12/2.5 | full=true budget=('50000', '12', '2.5') | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/03-agent-03-after-reload.png |
| 20 | [Agent 配置] 非法 Token 预算上限=0 校验 | 后端 422 且界面显示中文校验文案 | UI='请求参数校验失败：maxTokens' REST=422 {"code": "VALIDATION_FAILED", "message": "请求参数校验失败：maxTokens"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/04-agent-04-invalid-0.png |
| 21 | [Agent 配置] 非法 最大轮次=101 校验 | 后端 422 且界面显示中文校验文案 | UI='请求参数校验失败：maxTurns' REST=422 {"code": "VALIDATION_FAILED", "message": "请求参数校验失败：maxTurns"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/05-agent-04-invalid-101.png |
| 22 | [Agent 配置] 非法 成本上限（USD）=-1 校验 | 后端 422 且界面显示中文校验文案 | UI='请求参数校验失败：maxCostUsd' REST=422 {"code": "VALIDATION_FAILED", "message": "请求参数校验失败：maxCostUsd"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/06-agent-04-invalid-neg1.png |
| 23 | [Agent 配置] 还原 Agent 配置为默认 | approval, 20000/8/0.5 | {"currentRunMode": null, "nextRunMode": "approval", "modeSource": "account", "fullAccessScopes": ["read_search_compare_render", "content_patch", "metadata_update_archive"], "confirmRetainedOps": ["delete", "history_restore", "overwrite_export", "profile_to_resume", "fact_promotion"], "budget": {"maxTokens": 20000, "maxTurns": 8, "maxCostUsd": 0.5}} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/07-agent-05-restored.png |
| 24 | [模型配置] admin 浏览器登录 | 进入工作台 | ok=True err= | PASS |  |
| 25 | [模型配置] admin 模型配置读取 | Provider=DeepSeek / Model=DeepSeek V4.1 Flash / endpoint 已填 / Key 已配置 | provider='DeepSeek' model='DeepSeek V4.1 Flash' endpoint='https://api.deepseek.com/v1' keyConfigured=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/01-model-01-admin-loaded.png |
| 26 | [模型配置] admin 保存模型配置（值不变） | 保存成功；lastTest 被清空（编辑即失效） | status=200 lastTest=null | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/02-model-02-admin-saved.png |
| 27 | [模型配置] admin 测试连接（deepseek-flash） | 返回 ok=true（连接成功） | ok=False message='模型服务拒绝凭证，请检查 API Key 与 provider 配置' 耗时=1.1s UI='模型服务拒绝凭证，请检查 API Key 与 provider 配置' → BLOCKED：后端探测返回 HTTP 401，凭证被拒，非界面缺陷 | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/03-model-03-admin-test.png |
| 28 | [模型配置] admin 语言/主题未被改动 | language=zh-CN 且 theme=paper | language=zh-CN theme=paper displayName=管理员 | PASS |  |
| 29 | [模型配置] 主账号浏览器登录 | 进入工作台 | ok=True err= | PASS |  |
| 30 | [模型配置] 主账号选择 Provider=DeepSeek | 下拉可选并自动带出模型 | option=DeepSeek model='DeepSeek V4.1 Flash' | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/04-model-04-main-provider-selected.png |
| 31 | [模型配置] 主账号保存模型配置 | provider=deepseek model=deepseek-flash endpoint=api.deepseek.com/v1 keyConfigured=false | {"provider": "deepseek", "endpoint": "https://api.deepseek.com/v1", "model": "deepseek-flash", "keyConfigured": false, "lastTest": null} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/05-model-05-main-saved.png |
| 32 | [模型配置] 主账号无 Key 测试连接 | 返回可读失败结果（不泄露密钥） | result={"at": "2026-10-09T07:01:32.498630Z", "ok": false, "message": "模型服务拒绝凭证，请检查 API Key 与 provider 配置"} 耗时=1.1s | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/06-model-06-main-test-nokey.png |
| 33 | [模型配置] 还原主账号模型配置 | provider/model/endpoint 均为空 | {"provider": "", "endpoint": "", "model": "", "keyConfigured": false, "lastTest": null} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/07-model-07-main-restored.png |
| 34 | [快捷键冲突] 读取快捷键默认映射 | 4 个动作且无冲突 | {"save_flush": "⌘ S", "send_message": "⌘ ↵", "open_history": "⌘ H", "accept_all_diff": "⌘ ⇧ A"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/01-shortcuts-01-defaults.png |
| 35 | [快捷键冲突] 两个动作绑定同一组合键 → 保存被拒 | 界面出现冲突提示且后端 422 | UI='按键 ⌘ S 已绑定给「save_flush」，请先解除冲突' REST=422 {"code": "VALIDATION_FAILED", "message": "按键 ⌘ S 已绑定给「save_flush」，请先解除冲突"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/03-shortcuts-03-conflict-rejected.png |
| 36 | [快捷键冲突] 冲突保存被拒后映射保留原值 | send_message 仍为 ⌘ ↵ | {"save_flush": "⌘ S", "send_message": "⌘ ↵", "open_history": "⌘ H", "accept_all_diff": "⌘ ⇧ A"} | PASS |  |
| 37 | [快捷键冲突] 合法组合 ⌘ J 保存 | REST send_message=⌘ J 且无冲突标记 | {"save_flush": "⌘ S", "send_message": "⌘ J", "open_history": "⌘ H", "accept_all_diff": "⌘ ⇧ A"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/04-shortcuts-04-valid-saved.png |
| 38 | [快捷键冲突] 刷新后合法组合回显 | 发送对话输入框 = ⌘ J | value='⌘ J' | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/05-shortcuts-05-after-reload.png |
| 39 | [快捷键冲突] 还原快捷键默认 | send_message=⌘ ↵ | {"save_flush": "⌘ S", "send_message": "⌘ ↵", "open_history": "⌘ H", "accept_all_diff": "⌘ ⇧ A"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/06-shortcuts-06-restored.png |
| 40 | [RBAC 角色权限] admin(REST) 登录 | 200 且 role=super_admin | status=200 role=super_admin | PASS |  |
| 41 | [RBAC 角色权限] REST 读取权限目录 | 权限目录非空且分组固定 | 共 20 条权限，分组=['access', 'account', 'backup', 'jd', 'profile', 'resume', 'role', 'settings', 'user'] | PASS |  |
| 42 | [RBAC 角色权限] RBAC 页面加载 | 角色树含系统内置/自定义分组，权限树渲染 | role_tree_has_system=True role_tree_has_custom=True perm_rows=29 | PASS |  |
| 43 | [RBAC 角色权限] 系统内置角色渲染 | 超级管理员/管理员/普通用户 均在树中 | {"超级管理员": true, "管理员": true, "普通用户": true} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/01-rbac-01-loaded.png |
| 44 | [RBAC 角色权限] 新建角色 · 权限树初始态 | 所有分组未选中（无半选） | 分组状态=[["开放接入", false, false], ["账号", false, false], ["备份", false, false], ["岗位", false, false], ["职业事实", false, false], ["简历", false, false], ["角色与权限", false, false], ["设置", false, false], ["用户", false, false]] | PASS |  |
| 45 | [RBAC 角色权限] 勾选 resume:read · 三态-半选 | 「简历」分组 indeterminate=true | 简历={"label": "简历", "code": null, "isFolder": true, "checked": false, "indeterminate": true, "disabled": false} resume:read={"label": "读取简历", "code": "resume:read", "isFolder": false, "checked": true, "indeterminate": false, "disabled": false} | PASS |  |
| 46 | [RBAC 角色权限] 再勾选 resume:write · 三态-全选 | 「简历」分组 checked=true 且非半选 | {"label": "简历", "code": null, "isFolder": true, "checked": true, "indeterminate": false, "disabled": false} | PASS |  |
| 47 | [RBAC 角色权限] 取消 resume:read · 回到半选 | 「简历」分组 indeterminate=true | {"label": "简历", "code": null, "isFolder": true, "checked": false, "indeterminate": true, "disabled": false} | PASS |  |
| 48 | [RBAC 角色权限] 勾选 resume:read/write + jd:read · 三态组合 | 简历已全选、岗位半选、账号未选 | 简历={"label": "简历", "code": null, "isFolder": true, "checked": true, "indeterminate": false, "disabled": false} 岗位={"label": "岗位", "code": null, "isFolder": true, "checked": false, "indeterminate": true, "disabled": false} 账号={"label": "账号", "code": null, "isFolder": true, "checked": false, "indeterminate": false, "disabled": false} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/02-rbac-02-tri-state.png |
| 49 | [RBAC 角色权限] 创建自定义角色 | REST 中角色存在且权限=['resume:read', 'resume:write', 'jd:read'] | created={"id": "role_e2e_rbac_1791528987_519143", "code": "e2e_rbac_1791528987", "name": "E2E 权限测试角色", "description": "E2E 自动化创建的临时角色", "rank": 0, "isSystem": false, "permissions": ["jd:read", "resume:read", "resume:write"]} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/03-rbac-03-created.png |
| 50 | [RBAC 角色权限] 刷新后重新选中角色 · 权限回显一致 | resume:read/write、jd:read 勾选；简历全选/岗位半选 | clicked=True resume:read=True resume:write=True jd:read=True 简历={"label": "简历", "code": null, "isFolder": true, "checked": true, "indeterminate": false, "disabled": false} 岗位={"label": "岗位", "code": null, "isFolder": true, "checked": false, "indeterminate": true, "disabled": false} account:read=False | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/04-rbac-04-reload-echo.png |
| 51 | [RBAC 角色权限] 角色详情显示权限计数 | 显示「3 项权限」 | detail contains 3 项权限=True | PASS |  |
| 52 | [RBAC 角色权限] 修改角色名称与权限 | REST 权限=['resume:read', 'jd:read', 'account:read'] 且名称=E2E 权限测试角色-改 | {"id": "role_e2e_rbac_1791528987_519143", "code": "e2e_rbac_1791528987", "name": "E2E 权限测试角色-改", "description": "E2E 自动化创建的临时角色", "rank": 0, "isSystem": false, "permissions": ["account:read", "jd:read", "resume:read"]} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/06-rbac-06-updated.png |
| 53 | [RBAC 角色权限] 修改后刷新回显一致 | resume:read、jd:read、account:read 勾选；简历/账号半选 | resume:read=True resume:write=False jd:read=True account:read=True 账号={"label": "账号", "code": null, "isFolder": true, "checked": false, "indeterminate": true, "disabled": false} 简历={"label": "简历", "code": null, "isFolder": true, "checked": false, "indeterminate": true, "disabled": false} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/07-rbac-07-updated-echo.png |
| 54 | [RBAC 角色权限] 删除自定义角色 | REST 中角色已不存在 | gone=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/08-rbac-08-deleted.png |
| 55 | [RBAC 角色权限] 系统角色只读 | 显示只读提示且无删除按钮 | readonly_notice=True delete_btn=0 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/09-rbac-09-system-readonly.png |
| 56 | [RBAC 角色权限] REST 修改系统角色被拒 | 422 且提示系统角色不可修改 | status=422 body={"code": "VALIDATION_FAILED", "message": "系统角色不可修改"} | PASS |  |
| 57 | [用户管理] 准备：admin2 已为 admin 角色并登录 | role=admin | status=200 role=admin | PASS |  |
| 58 | [用户管理] 导航中查找用户管理入口 | 存在用户管理入口（本 worktree 未实现，属 UI 缺口） | has_user_entry=False links_with_users=0 nav='Resumate / 对话式简历工作台 / 工作台 / 简历库 / 个人资料 / JD 库 / 模拟面试 / 设置与 Agent / 管理员 / 模板库 / 角色与权限 / 管 /  / 管理员 /  / 超级管理员 /  / 退出登录' | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/01-users-01-nav.png |
| 59 | [用户管理] 访问 /admin/users | 存在用户管理页面 | 页面文案='Resumate / 对话式简历工作台 / 工作台 / 简历库 / 个人资料 / JD 库 / 模拟面试 / 设置与 Agent / 管理员 / 模板库 / 角色与权限 / 管 /  / 管理员 /  / 超级管理员 /  / 退出登录 /  / 未找到该页面 /  / 它可能已被删除或从未存在。 /  / 错误码：404 /  / 返回工作台' | FAIL | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/02-users-02-admin-users-404.png |
| 60 | [用户管理] 超管把自建用户角色改为 admin | 200 且 roles=[admin] | status=200 body={"id": "user_35ed619f7007", "email": "e2e-settings-rbac-good-1791528987@example.com", "displayName": "E2E 被管账号", "role": "admin", "roles": ["admin"], "permissions": ["access:read", "access:write", "account:read", "account:write", "backup:read", "backup:write", "jd:read", "jd:write", "profile:read", "profile:write", "resume:read", "resume:write", "settings:read", "settings:write", "user:ban", "user:read", "user:unban"], "isBanned": false, "createdAt": "2026-10-09T14:56:28.695143+08:00"} | PASS |  |
| 61 | [用户管理] 超管把自建用户角色改回 user | 200 且 roles=[user] | status=200 body={"id": "user_35ed619f7007", "email": "e2e-settings-rbac-good-1791528987@example.com", "displayName": "E2E 被管账号", "role": "user", "roles": ["user"], "permissions": ["access:read", "access:write", "account:read", "account:write", "backup:read", "backup:write", "jd:read", "jd:write", "profile:read", "profile:write", "resume:read", "resume:write", "settings:read", "settings:write"], "isBanned": false, "createdAt": "2026-10-09T14:56:28.695143+08:00"} | PASS |  |
| 62 | [用户管理] admin 封禁超管（更高权限） | 403 FORBIDDEN 且提示不能封禁同级或更高权限 | status=403 body={"code": "FORBIDDEN", "message": "不能封禁同级或更高权限的账号"} | PASS |  |
| 63 | [用户管理] admin 封禁同级 admin | 403 FORBIDDEN 且提示不能封禁同级或更高权限 | status=403 body={"code": "FORBIDDEN", "message": "不能封禁同级或更高权限的账号"} | PASS |  |
| 64 | [用户管理] admin 尝试改用户角色（无 role:assign） | 403 且提示没有该操作权限 | status=403 body={"code": "FORBIDDEN", "message": "当前账号没有该操作权限"} | PASS |  |
| 65 | [用户管理] 超管封禁自建用户 | 200 且 isBanned=true | status=200 isBanned=True | PASS |  |
| 66 | [用户管理] 封禁后旧会话立即失效 | 401 UNAUTHENTICATED | status=401 body={"code": "UNAUTHENTICATED", "message": "登录已失效，请重新登录"} | PASS |  |
| 67 | [用户管理] 被封禁用户 REST 登录被拒 | 403 ACCOUNT_BANNED | status=403 body={"code": "ACCOUNT_BANNED", "message": "账号已被封禁，请联系管理员"} | PASS |  |
| 68 | [用户管理] 被封禁用户浏览器登录 | 停留登录页并显示「账号已被封禁，请联系管理员。」 | ok=False error='账号已被封禁，请联系管理员。' | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/03-users-03-banned-login.png |
| 69 | [用户管理] 超管解封自建用户 | 200 且 isBanned=false | status=200 isBanned=False | PASS |  |
| 70 | [用户管理] 解封后浏览器可登录 | 进入工作台 | ok=True err='' url=http://127.0.0.1:5173/ | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/settings-rbac/04-users-04-unbanned-login.png |
| 71 | [用户管理] 超管封禁自己 | 422 且提示不能封禁自己 | status=422 body={"code": "VALIDATION_FAILED", "message": "不能封禁自己的账号"} | PASS |  |
| 72 | [用户管理] 超管修改自己的角色 | 422 且提示不能修改自己的角色 | status=422 body={"code": "VALIDATION_FAILED", "message": "不能修改自己的角色"} | PASS |  |
| 73 | [用户管理] 同级（super_admin→super_admin 操作者）改角色为 admin · 观察项 | 期望被越权保护拒绝（不能改同级或更高） | promote=True change_status=200 body={"id": "user_30989ed704ce", "email": "e2e-settings-rbac-admin2-1791528987@example.com", "displayName": "E2E 二级管理员", "role": "admin", "roles": ["admin"], "permissions": ["access:read", "access:write", "account:read", "account:write", "backup:read", "backup:write", "jd:read", "jd:write", "profile:read", "profile:write", "resume:read", "resume:write", "settings:read", "settings:write", "user:ban", "user:read", "user:unban"], "isBanned": false, "createdAt": "2026-10-09T14:56:29.343518+08:00"}（后端 change_role 无同级越权检查） | FAIL | areas/settings-rbac/raw-users.json |
| 74 | [用户管理] 收尾状态还原 | good=user 未封禁；admin2=admin | good={"id": "user_35ed619f7007", "email": "e2e-settings-rbac-good-1791528987@example.com", "displayName": "E2E 被管账号", "role": "user", "roles": ["user"], "permissions": ["access:read", "access:write", "account:read", "account:write", "backup:read", "backup:write", "jd:read", "jd:write", "profile:read", "profile:write", "resume:read", "resume:write", "settings:read", "settings:write"], "isBanned": false, "createdAt": "2026-10-09T14:56:28.695143+08:00"} admin2={"id": "user_30989ed704ce", "email": "e2e-settings-rbac-admin2-1791528987@example.com", "displayName": "E2E 二级管理员", "role": "admin", "roles": ["admin"], "permissions": ["access:read", "access:write", "account:read", "account:write", "backup:read", "backup:write", "jd:read", "jd:write", "profile:read", "profile:write", "resume:read", "resume:write", "settings:read", "settings:write", "user:ban", "user:read", "user:unban"], "isBanned": false, "createdAt": "2026-10-09T14:56:29.343518+08:00"} | PASS |  |

合计：70 通过 / 4 失败

## 环境
- worktree：<本机用户名>/resumate-worktrees/zj-fwwb-2026
- 后端 http://127.0.0.1:8000（uvicorn --reload；测试期间因另一工作流改后端代码短暂重启一次，REST 客户端已加连接重试）
- 前端 http://127.0.0.1:5173（无头 chromium，locale=zh-CN，每个功能独立 context）
- 自建账号（REST /auth/register，token 取自 /tmp/resumate-e2e-mail，验证后登录）：
  - 主账号（偏好/Agent/快捷键/模型保存）：e2e-settings-rbac-main-1791528987@example.com
  - 被管账号（封禁/解封）：e2e-settings-rbac-good-1791528987@example.com
  - 二级管理员（越权测试）：e2e-settings-rbac-admin2-1791528987@example.com（由超管提为 admin）
- admin 只用于模型连通性测试与 RBAC/用户管理；测试后已核对 language=zh-CN、theme=paper、displayName=管理员 未变。

## 通过/失败矩阵

| 功能 | 步骤数 | 通过 | 失败 |
|---|---|---|---|
| 设置偏好 | 12 | 12 | 0 |
| Agent 配置 | 11 | 11 | 0 |
| 模型配置 | 10 | 9 | 1 |
| 快捷键冲突 | 6 | 6 | 0 |
| RBAC 角色权限 | 17 | 17 | 0 |
| 用户管理 | 18 | 15 | 3 |

合计：70 通过 / 4 失败

## 结论
- 通过：设置偏好（主题/语言/自动保存/默认模板，保存+刷新+REST 交叉验证）、Agent 配置（approval/full_access、budget 保存与 422 中文校验文案）、快捷键冲突拦截、模型配置读取/保存、RBAC 全流程（角色树、权限三态半选、增删改、回显一致、系统角色只读）、用户封禁/解封（ACCOUNT_BANNED + 浏览器登录提示 + 解封恢复）、越权保护（封禁同级/更高权限被拒、无 role:assign 被拒、自我保护）。
- 失败/受限：见下「缺陷」。

## 缺陷

### D1（UI 缺口）用户管理没有前端入口与页面
- 现象：导航「管理员」分组只有「模板库」「角色与权限」，没有用户管理；直接访问 /admin/users 得到 404 页（「未找到该页面 / 错误码：404」）。后端 /auth/users、/auth/users/{id}/ban|unban|role 均存在且行为正确，但没有任何 UI 可点，用户管理只能靠 REST 完成。
- 最小复现：admin 登录 → 左侧菜单只有模板库/角色与权限 → 地址栏输入 http://127.0.0.1:5173/admin/users → 显示 404。
- 原始证据：areas/settings-rbac/steps-users.json 第 2、3 条；截图 areas/settings-rbac/01-users-01-nav.png、02-users-02-admin-users-404.png。
- 影响：本 worktree 的「用户管理」需求（改角色/封禁/解封）没有可用界面。

### D2（授权不一致）change_role 缺少同级/更高权限越权校验
- 现象：ban_user/unban_user 走 _require_actor_outranks，会拒绝同级或更高权限（403「不能封禁同级或更高权限的账号」）；change_role 没有该校验，只有「不能改自己」「保留至少一个超管」两条保护。于是 rank 3 的超管可以把另一个 rank 3 的超管降级为 admin，返回 200。
- 最小复现（REST，admin=super_admin 会话）：
  1. POST /auth/users/{B}/role {"role":"super_admin"} → 200（B 也成 super_admin，两个 rank=3）
  2. POST /auth/users/{B}/role {"role":"admin"} → 期望被拒，实际 200，B 被降级。
- 原始证据：areas/settings-rbac/raw-users.json 的 admin2_promoted_super、same_rank_role_change；steps-users.json 第 17 条。
- 说明：任务要求「不能封禁/改同级或更高权限账号」，封禁路径已实现，改角色路径缺失，与同一权限族的封禁保护不一致。

### D3（BLOCKED，环境/凭证）admin 的 deepseek-flash 连通性测试返回 HTTP 401
- 现象：admin 已配置 provider=deepseek / model=deepseek-flash / endpoint=https://api.deepseek.com/v1 / keyConfigured=true，点击「测试连接」约 1.1s 后返回 ok=false，界面与 REST 均为「模型服务拒绝凭证，请检查 API Key 与 provider 配置」。
- 判定：这是后端探测到的真实上游结果（401）。后端按契约不回显上游原文、也不泄露密钥，所以只有这句通用文案；该 key 在 2026-10-07 曾通过（lastTest ok=true），现被上游拒绝，记为 BLOCKED 而非界面缺陷。
- 原始证据：areas/settings-rbac/raw-model.json 的 admin_test；steps-model.json 第 4 条；截图 areas/settings-rbac/03-model-03-admin-test.png。
- 主账号无 Key 测试同样返回「模型服务拒绝凭证...」，失败路径文案正常且不含密钥（raw-model.json 的 main_test_nokey）。

## 观察项（非阻断）
- 快捷键冲突提示把内部动作键直接拼进中文句子：「按键 ⌘ S 已绑定给『save_flush』，请先解除冲突」。同界面动作名走 i18n 显示为「保存并提交」，建议后端错误也映射为动作显示名。证据：steps-shortcuts.json 第 2 条。
- 共享脚手架 docs/e2e/2026-10-09/scripts/e2e_lib.py 的 api_login() 走 POST /login，但后端真实前缀是 /auth/login（实测 POST /login → 404）。本 area 未改该共享文件，自建 settings_rbac_lib.login_cookie() 走 /auth/login 完成登录。

## 原始证据索引
- areas/settings-rbac/raw-setup.json
- areas/settings-rbac/accounts.json
- areas/settings-rbac/raw-prefs.json
- areas/settings-rbac/raw-agent.json
- areas/settings-rbac/raw-model.json
- areas/settings-rbac/raw-shortcuts.json
- areas/settings-rbac/raw-rbac.json
- areas/settings-rbac/raw-users.json
- areas/settings-rbac/steps-prefs.json
- areas/settings-rbac/steps-agent.json
- areas/settings-rbac/steps-model.json
- areas/settings-rbac/steps-shortcuts.json
- areas/settings-rbac/steps-rbac.json
- areas/settings-rbac/steps-users.json