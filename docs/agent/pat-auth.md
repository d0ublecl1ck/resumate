# PAT Bearer 鉴权（Agent 操作层跟进）

> 本文是 docs/agent/agent-operation-api.md 的补充冻结约定，只覆盖 PAT 请求鉴权与 Scope 强制。
> 上游：contracts C-01 / C-02 / C-06 / C-10。先改本文，再改实现。

## 1. 认证路径

- 请求带 **Authorization: Bearer rsm_pat_...** → 走 PAT 身份。
- 否则走现有 HttpOnly 会话 Cookie。
- 两者同时存在时 Bearer 优先。

## 2. 校验顺序

1. 取 Bearer 明文，SHA-256 后查 personal_access_tokens.token_hash。
2. 未命中 → 401 UNAUTHENTICATED。
3. revoked_at 非空 → 401 TOKEN_REVOKED。
4. expires_at 已过 → 401 UNAUTHENTICATED。
5. 加载 owner 用户与 RBAC 投影；被封禁 → 403 ACCOUNT_BANNED。
6. 端点所需权限码不在 PAT scopes → 403 SCOPE_INSUFFICIENT。
7. 通过 → 更新 last_used_at，并写一条 access_logs（result=allowed）。
8. 任一拒绝 → 写一条 access_logs（result=denied，error_code 为机器码）。

## 3. Scope 与权限

- 允许的 scope 集合为 access/service.py 的 ALLOWED_SCOPES。
- 端点权限码与 scope 同名（resume:read / resume:write 等），按集合成员直接判断。
- 非 scopable 权限（access:write、user:read、role:write 等）PAT 一律 SCOPE_INSUFFICIENT。

## 4. 身份与信任边界

- CurrentUser 增加 auth_kind（session | pat）与 pat_id（可空）。
- PAT 请求的 source 由服务端按 agent 处理，不信任入参。
- **PAT 请求的 executionMode 入参必须被忽略**，模式只从 agent 配置 / 账户默认解析（modeSource = agent | account），防止用入参把账户切到 full_access 绕过审批（C-01/C-02）。
- 会话请求保持现状：可信前端可用显式 session 模式。
- 审计覆盖操作者、client_id、scope、资源、结果；不得回传令牌明文或哈希。

## 5. 验收

- resume:write PAT 可创建轮次并 apply；resume:read PAT 调用写端点 → SCOPE_INSUFFICIENT。
- revoked / expired / 未知 token → 401 且对应错误码。
- PAT 传 executionMode=full_access 时，轮次仍按账户 / agent 配置固化（默认 approval）。
- 成功与拒绝各产生 access_logs。
- 现有会话路径与全部既有测试不回归。
