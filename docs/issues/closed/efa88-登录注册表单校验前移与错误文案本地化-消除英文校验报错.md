---
id: efa88
status: closed
created_at: 2026-09-28T04:20:00.000Z
updated_at: 2026-09-28T04:13:35.323Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 核心实体接口
started_at: 2026-09-28T04:12:07.871Z
closed_at: 2026-09-28T04:13:35.323Z
---

# 登录注册表单校验前移与错误文案本地化（消除英文校验报错）

## Background

用户在不含 `@` 的邮箱上注册，界面仍显示 pydantic 原文 `value is not a valid email address: An email address must have an @-sign.`。

两条泄漏路径未修：后端 `app/main.py` 的 `RequestValidationError` 处理器把 pydantic 英文 `msg` 拼进 `ApiError.message`；前端 `ui/src/pages/login.tsx` 的 `messageFor` 对未映射错误码兜底 `return cause.message`（带 `error-message-allow` 豁免）。`login-form.tsx` 也没有客户端校验（`noValidate` + `form-allow` 豁免），唯一校验点是后端 `EmailStr`。6a58a 只加了门禁，没有修行为。

## Scope

- 后端：`RequestValidationError` 返回中文稳定文案（含字段名），不再透出 pydantic 英文原文。
- 前端 `login.tsx`：`messageFor` 映射 `VALIDATION_FAILED` 到 i18n 文案，删除 `cause.message` 兜底与 `error-message-allow` 豁免。
- 前端 `login-form.tsx`：接入 `react-hook-form` + `zod` 做客户端校验（邮箱格式、注册昵称必填、密码长度），删除 `form-allow` 豁免。
- i18n：新增校验文案键，zh-CN 与 en 结构一致。
- Storybook：补校验报错态 story。

## Non-goals

- 不改邮箱验证注册/登录门禁的既有契约。
- 不改其他后端端点的校验语义（仅统一报错文案）。
- 不重构登录页视觉。

## Acceptance Criteria

- [x] `POST /auth/register` 传非法邮箱返回 422，`message` 为中文且不含 pydantic 原文。
- [x] 前端在提交前拦截非法邮箱并展示中文提示，不发请求。
- [x] `messageFor` 不再直出后端 message，`error-message-allow` 与 `form-allow` 豁免删除。
- [x] zh-CN 与 en 文案键结构一致，无硬编码文案。
- [x] Storybook 含校验报错态 story。
- [x] `pytest -q`、`pnpm -C ui test`、`pnpm -C ui build-storybook`、`archkit inspect .` 通过。

## Implementation

- `backend/app/main.py`：`RequestValidationError` 处理器改为返回中文稳定文案并列出出错字段（`请求参数校验失败：email`），不再拼 pydantic 英文 msg。
- `ui/src/pages/login.tsx`：`messageFor` 新增 `VALIDATION_FAILED` → `auth.errors.invalidInput` 映射，删除 `cause.message` 兜底与 `error-message-allow` 注释。
- `ui/src/components/login-form.tsx`：迁移到 `react-hook-form` + `zodResolver`，校验邮箱格式、注册昵称必填与密码长度，删除 `form-allow` 豁免；对外仍走原 `onSubmit(credentials)` 契约。
- `ui/src/i18n/locales/{zh-CN,en}/auth.ts`：新增 `errors.invalidInput` / `invalidEmail` / `shortPassword` / `requiredPassword` / `requiredName`。
- Storybook：`Pages/Login` 新增 `ValidationFailed` 与 `InvalidEmail` 两态。
- 测试：后端新增本地化校验文案断言；前端新增「客户端拦截非法邮箱」与「后端 422 映射中文」断言，两处提交断言改用 `waitFor` 适配异步提交。

## Verification

- 修复前：`curl -X POST localhost:8000/auth/register -H 'Content-Type: application/json' -d '{"email":"abc","password":"password123","displayName":"x"}'` → `422`，`message` 为 `value is not a valid email address: An email address must have an @-sign.`
- 修复后：同一命令 → `422 {"code":"VALIDATION_FAILED","message":"请求参数校验失败：email"}`
- `cd backend && .venv/bin/python -m pytest -q` → `157 passed`
- `cd ui && node_modules/.bin/tsc -b` → exit 0
- `pnpm -C ui test` → `14 files / 96 passed`
- `pnpm -C ui build-storybook` → 成功
- `archkit inspect .` → `Quality gates passed.`

## Related ADRs

- None.
