# smoke E2E 证据

| # | 步骤 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | 打开登录页 | 渲染登录表单 | title=Resumate · 对话式简历工作台 url=http://127.0.0.1:5173/login | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/smoke/01-login-page.png |
| 2 | 管理员登录 | 跳转工作台 | url=http://127.0.0.1:5173/ | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/smoke/03-workbench.png |
| 3 | 工作台渲染 | 出现导航与工作台内容（长度 > 200） | len=323 sample=Resumate / 对话式简历工作台 / 工作台 / 简历库 / 个人资料 / JD 库 / 模拟面试 / 设置与 Agent / 管理员 / 模板库 / 角色与权限 / 管 /  / 管理员 /  / 超级管理员 /  /  | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/smoke/03-workbench.png |
| 4 | 无 JS 异常 | 无 pageerror（字体 403 属 worktree 软链 node_modules 的环境噪声） | pageerror=0 font403=6 | PASS |  |

合计：4 通过 / 0 失败