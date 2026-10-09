# auth E2E 证据

| # | 步骤 | 预期 | 实际 | 结果 | 证据 |
|---|---|---|---|---|---|
| 1 | 1 注册新账号 | 202 verification_sent 且进入查收验证链接态 | HTTP 202 body={"status":"verification_sent","email":"e2e-auth-20261009-145642@example.com"} | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/01-01-register-verification-sent.png |
| 2 | 2 未验证登录被拒 | 403 EMAIL_NOT_VERIFIED + 文案 + 内联重发入口 | HTTP 403 code=EMAIL_NOT_VERIFIED 内联按钮=1 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/02-02-login-unverified.png |
| 3 | 6a 重发冷却(60s) | 429 RESEND_TOO_SOON + 冷却提示 + 不再发信 | HTTP 429 code=RESEND_TOO_SOON UI含重发过于频繁=True 新增邮件=0 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/03-03-resend-cooldown.png |
| 4 | 6b 冷却后重发成功 | 202 + 冷却态 + 收到新验证邮件 | HTTP 202 页面含冷却=True 新邮件=/tmp/resumate-e2e-mail/20261009-145751-359408.eml token=H82YL9p3IGCdGaqaMVz2viDfa7_X8_T8wECW-smBXUI | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/04-04-resend-after-cooldown.png |
| 5 | 6c 无效 token 失效提示 | 显示验证链接已失效 + 原因 | 含已失效=True 含已过期=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/05-05-verify-invalid-token.png |
| 6 | 3 验证链接完成验证并进入工作台 | 200 验证成功 -> 工作台 | verify HTTP 200 工作台=True url=http://127.0.0.1:5173/ | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/06-06-verify-success.png ; <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/07-07-workbench-after-verify.png |
| 7 | 5 验证 token 复用 | 已使用链接再次打开显示失效页 | 含已失效=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/08-08-verify-token-reuse.png |
| 8 | 4 验证后登录/退出 | 退出回登录页，再登录进工作台 | 退出=True 再登录 HTTP 200 工作台=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/09-09-logout.png ; <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/10-10-login-verified.png |
| 9 | 8 前置 另开已登录会话 | 第二个 context 用旧密码登录成功 | url=http://127.0.0.1:5173/ | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/11-11-old-session-logged-in.png |
| 10 | 7 忘记密码提交 | 202 reset_sent + 收到重置邮件 | HTTP 202 邮件=/tmp/resumate-e2e-mail/20261009-145810-161111.eml token=hs9oDMH8-UjLRkqMQAMW5D6sjENncu-biP1BTk6Yccw | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/12-12-forgot-sent.png |
| 11 | 7 重置新密码 | 204 + 密码已重置页 | HTTP 204 body=<unreadable: Response.text: Protocol error (Network.getResponseBody): No data found for resource with given identifier> | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/13-13-reset-success.png |
| 12 | 8 重置后旧会话失效 | 旧 context 刷新后被踢回登录页 | url=http://127.0.0.1:5173/login 登录页=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/14-14-old-session-kicked.png |
| 13 | 7b 旧密码登录失败 | 401 INVALID_CREDENTIALS + 文案 | HTTP 401 code=INVALID_CREDENTIALS | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/15-15-old-password-fails.png |
| 14 | 7b 新密码登录成功 | 200 + 工作台 | HTTP 200 工作台=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/15-15-old-password-fails.png ; <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/16-16-new-password-login.png |
| 15 | 9 设置页改密入口 | 记录是否存在改密 UI | 设置页含密码按钮=0 | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/17-17-settings-no-password-entry.png |
| 16 | 9 前置 改密前已登录会话 | 新密码登录成功 | url=http://127.0.0.1:5173/ | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/18-18-change-password-old-session.png |
| 17 | 9 改密失败路径(当前密码错误) | 401 INVALID_CREDENTIALS | HTTP 401 code=INVALID_CREDENTIALS | PASS |  |
| 18 | 9 改密失败路径(新密码=旧密码) | 422 VALIDATION_FAILED | HTTP 422 code=VALIDATION_FAILED | PASS |  |
| 19 | 9 改密成功路径 | 204 | HTTP 204 body= | PASS |  |
| 20 | 9 改密后 API 会话失效 | GET /auth/me 401 | HTTP 401 code=UNAUTHENTICATED | PASS |  |
| 21 | 9 改密后旧会话失效(浏览器) | 刷新后被踢回登录页 | url=http://127.0.0.1:5173/login 登录页=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/19-19-change-password-session-kicked.png |
| 22 | 9 改密后新密码可登录 | 200 + 工作台 | url=http://127.0.0.1:5173/ 工作台=True | PASS | <本机用户名>/resumate-worktrees/zj-fwwb-2026/docs/e2e/2026-10-09/areas/auth/20-20-changed-password-login.png |

合计：22 通过 / 0 失败

## 账号与凭据
- 测试账号：e2e-auth-20261009-145642@example.com （昵称 E2E Auth ）
- 初始密码：E2eAuth!2026 -> 重置后：E2eReset!2026 -> 改密后：E2eChanged!2026
- 管理员 admin@resumate.dev 未做任何改动。

## 备注
- 前端不存在改密入口：ui/src/lib/api.ts 未声明 POST /auth/password，设置页 /settings（含 access/backup）无密码表单。
  因此第 9 项改密的调用走 REST POST /auth/password，其旧会话失效在浏览器中验证。
- 邮箱验证/重置邮件的链接域名由后端 public_web_base_url（默认 http://localhost:5173）生成；
  报告中的验证/重置均在浏览器打开等价的 http://127.0.0.1:5173/... 链接，token 取自 .eml 原文。
- 环境噪声（非产品缺陷）：vite 对 /@fs/.../geist-*.woff2 返回 403；未登录时 /api/auth/me 401。

## 需求覆盖矩阵

| 需求 | 覆盖步骤 | 结果 |
|---|---|---|
| 1 注册新账号进入查收验证链接态 | #1 | PASS |
| 2 未验证登录被拒 (EMAIL_NOT_VERIFIED) + 内联重发 | #2 | PASS |
| 3 验证链接 -> 验证成功 -> 工作台 | #4 #5 #6 | PASS |
| 4 验证后登录/退出 | #8 | PASS |
| 5 验证 token 复用失效 | #7 | PASS |
| 6 重发冷却 60s + 冷却后重发 + 无效 token 失效 | #3 #4 #5 | PASS |
| 7 忘记密码 -> 重置 -> 新密码可登录 / 旧密码失败 | #10 #11 #13 #14 | PASS |
| 8 重置后旧会话失效 | #9 #12 | PASS |
| 9 改密失败/成功 + 改密后旧会话失效 | #15 #16 #17 #18 #19 #20 #21 #22 | PASS |

## 缺陷

未发现产品缺陷，22/22 步通过。

### 观察项（非缺陷）

1. 改密无前端入口：`ui/src/lib/api.ts` 未声明 `POST /auth/password`，`/settings`（Agent 与偏好 / 开放接入与审计 / 备份与迁移）没有任何密码表单；本次改密走 REST 验证（#17-#22）。
2. 文案措辞：任务描述为「邮箱尚未验证」，前端 i18n 实际渲染「邮箱还未验证，请先完成邮箱验证。」，后端原始 message 为「邮箱尚未验证，请先完成邮箱验证」。语义一致，仅用词不同。
3. 环境噪声：vite 对 `/@fs/.../geist-*.woff2` 返回 403；未登录 `/api/auth/me` 401。

## 原始证据文件

- raw-01-register.txt / raw-01-register-mail.txt
- raw-02-login-unverified.txt
- raw-03-resend-cooldown.txt
- raw-04-resend-success.txt
- raw-07-forgot.txt / raw-07-reset.txt
- raw-09-change-password.txt
- settings-page.txt
- 截图 01..20 见同目录

