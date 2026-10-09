# E2E 共享上下文（顶级工作流 B）

## 坐标（一律用绝对路径）
- 工作 worktree：`<本机用户名>/resumate-worktrees/zj-fwwb-2026`
- 主工作区 `<本机用户名>/resumate`、其他 worktree、`docs/competition/` **禁止读写**。
- 本任务唯一允许写入目录：`<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09`。

## 已运行的服务（不要重启、不要跑 scripts/dev.sh）
- 后端 http://127.0.0.1:8000 （FastAPI，健康检查 `/health/`）
- 前端 http://127.0.0.1:5173 （vite dev，`/api/*` 代理到后端）
- SMTP 捕获器 127.0.0.1:2525 → 邮件落盘 `/tmp/resumate-e2e-mail/*.eml`
- 后端进程日志：`<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/logs/backend.log`
- 数据库：PostgreSQL 库 `resumate`（与主工作区共用，测试数据加唯一前缀，避免动到已有数据）

## 账号
- 管理员：`admin@resumate.dev` / `resumate-admin`（超级管理员，全部权限）
- 自建测试用户：用 `e2e-<area>-<时间戳>@example.com`，走注册 + 邮件验证（邮件在 /tmp/resumate-e2e-mail）

## 脚手架
`<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts/e2e_lib.py`，用法：

```python
import sys
sys.path.insert(0, "<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts")
from e2e_lib import Recorder, browser_page, api, api_login

rec = Recorder("<area>")            # 证据写到 areas/<area>/
with browser_page() as page:        # 无头 chromium，locale=zh-CN
    page.goto("http://127.0.0.1:5173/login", wait_until="networkidle")
    page.get_by_label("邮箱").fill("admin@resumate.dev")
    page.get_by_label("密码").fill("resumate-admin")
    page.get_by_role("button", name="登录").click()
    page.wait_for_url("**/", timeout=15000)
    page.wait_for_timeout(1500)     # 等数据加载完再断言
    shot = rec.shot(page, "workbench")
    rec.step("步骤名", "预期", "实际", True/False, shot)
cookie = api_login("admin@resumate.dev", "resumate-admin")   # 需要直接用 REST 时
status, body = api("GET", "/resumes", cookie=cookie)
print(rec.write())                  # 生成 REPORT.md
```

运行：`/usr/bin/python3 <你的脚本>`（**无头**，禁止 visible 模式；禁止安装依赖）。


## REST 路径速查（后端直连 http://127.0.0.1:8000）
- 认证类统一前缀 `/auth`：`/auth/login`、`/auth/me`、`/auth/register`、`/auth/verification/verify`、`/auth/verification/resend`、`/auth/password/forgot`、`/auth/password/reset`、`/auth/password`、`/auth/users`、`/auth/roles`、`/auth/permissions`
- 其余按 `ui/src/lib/api.ts` 的路径：`/resumes`、`/jds`、`/jds:parse-text`、`/profile`、`/profile/facts`、`/settings`、`/agent/config`、`/models/config`、`/models/config:test`、`/models/catalog`、`/access/tokens`、`/access/logs`、`/backup/export`、`/backup/export/markdown`、`/backup/import:preview`、`/backup/import`
- `e2e_lib.api_login(email, password)` 返回可直接传 `cookie=` 的会话串，已实测可用。
- 新建的空白简历 document.sections 为空（结构化编辑器只有「基本信息」）；要测章节/条目编辑，用 `POST /resumes/{id}/duplicate` 复制一份**已有章节**的简历再操作。

## 硬要求
1. 每个功能都必须在浏览器里真点（Playwright 驱动），不能只调 REST 或只读代码就下结论；REST 可用于准备数据和交叉验证。
2. 每步记录：操作步骤 / 预期 / 实际 / 截图路径 / 原始输出。截图一律用 `rec.shot`，存在 `areas/<area>/`。
3. 发现 bug：先最小化复现，保存截图 + 原始响应体（status + body 原文），写进 REPORT.md 的「缺陷」一节，包含最小复现步骤。**不要自己改仓库源码**，把缺陷汇报给 `e2e-verify`。
4. 你只能写 `<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/<你的 area>/` 与你自己在 `<本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/scripts/` 下的脚本文件；两个子代理不要写同一个文件。
5. 禁止 git 写操作、禁止 pnpm/npm/uv 安装、禁止访问公网（除本地代理 127.0.0.1:7897）。
6. 界面文案必须用中文 locale 断言；判定 i18n 问题时同时切 en 复核。
7. 结束汇报（中文、简短）：通过/失败矩阵 + 失败项最小复现 + 证据路径。
8. 前端 dev server 会实时加载本 worktree 的未提交代码（另一个工作流 A 正在写 `ui/src/features/interview/**` 与 `backend/app/modules/interview/**`）。若失败点在这些路径，标注"疑似并发改动导致"并给出证据，不要当成产品缺陷。
9. 已知环境噪声（非产品缺陷）：vite 因 worktree 的 node_modules 是主仓软链，`/@fs/.../geist-*.woff2` 返回 403，字体回退；控制台会出现该 403。未登录时 `/api/auth/me` 401 属正常。
