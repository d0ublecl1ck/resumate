---
id: 62adb
status: closed
created_at: 2026-09-30T13:57:34.480Z
updated_at: 2026-09-30T13:59:12.142Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-30T13:57:41.270Z
closed_at: 2026-09-30T13:59:12.142Z
---

# 修复 verify-email 在 React StrictMode 下永久停留在验证中

## Background

注册后打开邮件里的 `/verify-email?token=<一次性令牌>` 链接，页面永久停留在「正在验证邮箱」加载态：既不进入成功态，也不进入失效态，用户无法完成注册。

后端此时其实已经成功消费令牌并把用户置为已验证，因此这是纯前端状态机缺陷，不是令牌或接口问题。

根因在 `ui/src/pages/verify-email.tsx` 的 effect：它用 `attempted` ref 防止重复请求，同时用 `active` 标志在 cleanup 中丢弃结果。React StrictMode 在开发模式会 mount → cleanup → mount：第一次 setup 发出请求并注册 `active = true`，cleanup 立刻把 `active` 置 false，第二次 setup 因 `attempted.current` 已为 true 直接返回。唯一那次请求的 `then` / `catch` 都被 `if (!active) return` 吞掉，`state` 永远停在 `"verifying"`。

现有 `ui/src/pages/verify-email.test.tsx` 未包裹 `StrictMode`，所以这条路径没有测试覆盖，缺陷得以漏过。

## Scope

- 修正 `ui/src/pages/verify-email.tsx` 中验证请求的生命周期处理：保证 StrictMode 的模拟重挂载不会丢弃唯一一次请求的结果，同时不重复发出请求。
- 在 `ui/src/pages/verify-email.test.tsx` 增加 StrictMode 回归测试，覆盖「只发一次请求」与「进入成功态」。

## Non-goals

- 不改动页面视觉、布局与文案（原型 `ui/prototypes/index.html` 的三态定义保持不变）。
- 不改动后端一次性令牌的语义、TTL 与接口契约。
- 不改动登录、注册页面的既有行为。

## Acceptance Criteria

- [x] 新增的 StrictMode 回归测试在修复前失败（成功态无法出现）。
- [x] StrictMode 下挂载只发出一次 `POST /api/auth/verification/verify`，一次性令牌不被二次消费。
- [x] StrictMode 下有效令牌进入「邮箱验证成功」，并可点击「进入工作台」。
- [x] 失效令牌在 StrictMode 下仍进入「验证链接已失效」。
- [x] `pnpm -C ui test` 通过。
- [x] `archkit inspect .` 通过。

## Implementation

`ui/src/pages/verify-email.tsx`：保留 `attempted` ref 作为「一次性令牌只请求一次」的保证，删除 cleanup 中的 `active` 标志以及 `then` / `catch` 里的 `if (!active) return`。StrictMode 的模拟重挂载不再丢弃唯一一次请求的结果，同时不会产生第二次请求去撞已消费的令牌。

`ui/src/pages/verify-email.test.tsx`：新增 `renderVerifyStrict`（包一层 `StrictMode`）与 `countVerifyRequests`（包裹 `fetch` 统计验证端点调用次数后交回原 fetch，仍由 MSW 拦截），并补两条回归用例：

- `StrictMode 下有效令牌仍进入验证成功态且只请求一次`
- `StrictMode 下失效令牌仍进入失效态`

`README.md`：前端测试口径随用例增加由 128 更新为 130。

## Verification

修复前（Red）：

```
pnpm -C ui test src/pages/verify-email.test.tsx
→ Tests  2 failed | 5 passed (7)
   失败输出中页面停在「正在验证邮箱」，与线上现象一致
```

修复后（Green）：

```
pnpm -C ui test src/pages/verify-email.test.tsx
→ Test Files 1 passed (1) / Tests 7 passed (7)

pnpm -C ui test
→ Test Files 17 passed (17) / Tests 130 passed (130)

archkit inspect .
→ Quality gates passed.
```

运行态证据（本机开发环境，令牌与邮箱做脱敏）：

- Redis：`auth:email_verify:<token-hash>` 已不存在，`auth:email_verify_lookup:<token-hash>` 仍在（lookup TTL 7 天）——说明令牌已被消费，而非未收到请求。
- 数据库：该账号 `created_at` 与其 `email_verified_at` 相差 15 秒，说明浏览器确实发出了验证请求且后端已置为已验证。
- 浏览器页面：仍显示「正在验证邮箱」，与修复前 StrictMode 回归测试的失败快照一致。

## Related ADRs

- None.
