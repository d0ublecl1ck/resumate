# ui-i18n-theme E2E 证据

| # | 步骤 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | 1 默认浅色（paper） | html 无 dark 类 | dark=False lang=zh-CN | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/ui-i18n-theme/01-theme-paper.png |
| 2 | 2 深色主题即时生效且持久化 | 保存后 html.dark=true，刷新后仍为 dark，REST theme=dark | after_save=True after_reload=True rest=dark | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/ui-i18n-theme/02-theme-dark.png |
| 3 | 3 切换英文后界面文案变英文 | lang=en，设置页出现 Preferences/Language/Theme 且无中文 chrome | lang=en chrome_en=True chrome_zh=False sample=Resumate / Conversational resume workspace / Workbench / Resumes / Profile / Job descriptions / Mock interview / Settings &  | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/ui-i18n-theme/03-lang-en-settings.png |
| 4 | 4 英文界面导航与区块标题为英文 | 四个页面的导航/标题为英文且不出现中文导航词（用户数据与角色名不翻译） | chrome={'workbench': {'en': True, 'zh_nav': False}, 'resumes': {'en': True, 'zh_nav': False}, 'jds': {'en': True, 'zh_nav': False}, 'profile': {'en': True, 'zh_nav': False}} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/ui-i18n-theme/04-lang-en-resumes.png |
| 5 | 5 还原中文+浅色 | lang=zh-CN、dark=false、REST 一致 | lang=zh-CN dark=False rest=zh-CN/paper | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/ui-i18n-theme/05-restored-zh-paper.png |
| 6 | 6 未知路由错误态 | 显示未找到页面 + 错误码 404 | text=Resumate / 对话式简历工作台 / 工作台 / 简历库 / 个人资料 / JD 库 / 模拟面试 / 设置与 Agent / 管理员 / 模板库 / 角色与权限 / 管 /  / 管理员 /  / 超级管理员 /  / 退出登录 /  / 未找到该页面 /  / 它可能已被删除或从未存在。 /  / 错误码：4 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/ui-i18n-theme/06-state-404-route.png |
| 7 | 7 不存在的简历错误态 | 显示未找到状态块且不白屏 | text=Resumate / 对话式简历工作台 / 工作台 / 简历库 / 个人资料 / JD 库 / 模拟面试 / 设置与 Agent / 管理员 / 模板库 / 角色与权限 / 管 /  / 管理员 /  / 超级管理员 /  / 退出登录 /  / 未找到该简历 /  / 它可能已被删除或从未存在。 /  / 错误码：4 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/ui-i18n-theme/07-state-resume-404.png |
| 8 | 8 不存在的 JD 错误态 | 显示未找到状态块 | text=Resumate / 对话式简历工作台 / 工作台 / 简历库 / 个人资料 / JD 库 / 模拟面试 / 设置与 Agent / 管理员 / 模板库 / 角色与权限 / 管 /  / 管理员 /  / 超级管理员 /  / 退出登录 /  / 未找到该岗位 JD /  / 它可能已被删除或从未存在。 /  / 错误 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/ui-i18n-theme/08-state-jd-404.png |
| 9 | 控制台无 JS 异常 | 无 pageerror | pageerror=[] | PASS |  |

合计：9 通过 / 0 失败