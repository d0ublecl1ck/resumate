---
id: d7b99
status: in-progress
created_at: 2026-09-28T03:39:52.163Z
updated_at: 2026-09-28T03:40:03.433Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-09-28T03:40:03.433Z
---

# 邮箱验证注册：验证令牌、SMTP 发信与登录门禁

## Background

现有注册是「注册即登录」：`POST /auth/register` 建号后立刻下发 HttpOnly 会话 Cookie（`backend/app/modules/auth/api.py`、`service.py`）。邮箱只经过 `EmailStr` 格式校验，没有任何归属证明；仓库也没有邮件发送、一次性验证令牌与限流设施。

本 issue 把注册改成真实邮箱验证，已与用户确认的决策：

- 注册成功不立刻发会话；未验证用户不能登录。
- 验证令牌存 Redis，只存哈希、一次性、带 TTL。
- 邮件通道用 SMTP（Gmail 应用专用密码，凭据只进未跟踪的 `backend/.env`）。
- 顺带实现注册/重发限流。
- 存量用户统一回填为已验证。
- 直接破坏性变更：旧「注册即登录」契约不保留兼容路径。

契约变化：`POST /auth/register` 从 201 + UserResponse + Set-Cookie 变为 202 + 中性响应体、不下发 Cookie；登录态只能由新的验证端点或 `POST /auth/login` 产生。

## Scope

- 后端配置：SMTP（host/port/user/password/from/tls）与验证参数（token TTL、重发冷却、限流阈值）进入 `app/core/config.py`，缺失必填项时快速失败。
- 数据模型：`users` 新增 `email_verified_at`（可空）；Alembic 迁移把存量行回填为 `created_at`。
- 验证令牌：新增 Redis 存储，key 用 SHA-256，一次性消费，TTL 到期自动失效。
- 限流：按邮箱与 IP 的 Redis 计数器，覆盖注册与重发。
- 邮件：新增基于 `smtplib` 的 mailer，作为可注入依赖，测试替换为 fake。
- 服务与端点：注册改为建未验证账号 + 发信；新增验证端点与重发端点；登录增加邮箱验证门禁。
- 错误契约：`app/shared/errors.py` 新增邮箱验证相关机器错误码。
- 测试：新增邮箱验证用例，并把既有依赖「注册即登录」的测试 helper 改为「注册 + 验证 + 登录」。
- 前端：注册成功进入「查收邮件」状态；新增错误码的 i18n 映射。前端按仓库规则先补原型并交付 Storybook 确认，确认后再实现。

## Non-goals

- 不做邮箱变更后的重新验证，也不做忘记密码/重置密码邮件。
- 不引入 Celery 或独立队列，发信先用 FastAPI BackgroundTasks。
- 不抽象多家邮件服务商，只实现 SMTP 一种通道。
- 不迁移 `login-form.tsx` 到 react-hook-form + zod，也不新增表单契约门禁（属 issue 6a58a）。
- 不改动 `docs/agent/agent-operation-api.md` 描述的 Agent 操作层与 PAT 行为。

## Acceptance Criteria

- [x] `POST /auth/register` 返回 202、响应不含用户资料、不下发会话 Cookie，且新建用户 `email_verified_at` 为空。
- [x] 验证令牌在 Redis 中只以 SHA-256 哈希存储，验证成功后立即删除，重复使用失败，TTL 到期后失败。
- [x] 邮件经 SMTP 发出；mailer 是可注入依赖，测试套件不产生真实发信。
- [x] 验证成功后下发 HttpOnly 会话 Cookie 并可访问 `GET /auth/me`。
- [x] 未验证用户登录返回 403 且机器错误码为 `EMAIL_NOT_VERIFIED`。
- [x] 重发端点遵守冷却时间，注册与重发超过限流阈值返回 `RATE_LIMITED`。
- [x] 迁移后存量用户的 `email_verified_at` 等于其 `created_at`，可正常登录。
- [x] 后端测试覆盖上述行为并全部通过。
- [ ] 前端注册成功进入「查收邮件」状态，新增错误码全部经 i18n 渲染，无硬编码中文。
- [ ] `archkit inspect .` 与 `pnpm -C ui test` 通过。

## Implementation

后端（已完成）：

- `app/core/config.py`：新增 `email_verification_*`、`smtp_*` 与 `public_web_base_url` 配置，SMTP 凭据只从环境读取。
- `app/modules/auth/models.py` + 迁移 `c4a7e2b9f1d3`：新增 `users.email_verified_at`，升级时把存量行回填为 `created_at`。
- `app/modules/auth/verification_store.py`：Redis 一次性验证令牌（只存 SHA-256）、重发冷却与按邮箱的发送配额。
- `app/modules/auth/mailer.py`：`Mailer` Protocol + `SmtpMailer`，`get_mailer` 作为依赖注入点。
- `app/modules/auth/service.py`：`register` 建未验证账号并返回待发邮件；新增 `resend_verification`、`verify_email`；`login` 增加未验证门禁。
- `app/modules/auth/api.py`：`POST /auth/register` 改为 202 且不下发 Cookie；新增 `POST /auth/verification/resend`、`POST /auth/verification/verify`。
- `app/shared/errors.py`：新增 `EMAIL_NOT_VERIFIED`、`VERIFICATION_TOKEN_INVALID`、`RESEND_TOO_SOON`、`RATE_LIMITED`。
- `app/tasks/seed.py`：引导管理员创建时直接置为已验证，避免新库管理员被门禁拦住。
- 测试：新增 `tests/support.py` 假 mailer 与 `tests/test_email_verification.py` 9 个用例；把 4 个依赖「注册即登录」的测试 helper 改为「注册 + 验证」；`tests/test_migrations.py` 增加列存在与回填断言。

前端：待原型与 Storybook 确认后实现。

## Verification

- `cd backend && .venv/bin/python -m pytest -q` → `152 passed`（含新增 9 个邮箱验证用例与 2 个迁移用例）。
- `archkit inspect .` → `Quality gates passed.`
- 真实 SMTP 投递：`SmtpMailer().send_verification_email('d0ublecl1ckhpx@gmail.com', ...)` 成功（Gmail 应用专用密码，凭据只存未跟踪的 `backend/.env`）。
- 迁移：`cd backend && .venv/bin/alembic upgrade head`；`users.email_verified_at` 存在，存量 5 个用户全部 `email_verified_at = created_at`。

前端验证待实现后补齐。

## Related ADRs

- None.
