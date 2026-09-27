---
id: 2b0be
status: closed
created_at: 2026-09-27T02:37:47.216Z
updated_at: 2026-09-27T02:40:05.942Z
priority: high
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-27T02:37:58.196Z
closed_at: 2026-09-27T02:40:05.942Z
---

# 前端对接核心实体后端 API

## Background

后端核心实体 CRUD（af02e 及其子工单 d8c9f、0981a、a74d2、ede13）已落地，但 `ui/src/lib/api.ts` 仍从 `content.ts` 读取 mock，页面无法读到真实数据。本期把已实现的端点接到真实 HTTP，未实现的端点继续保留 mock。

## Scope

- 新增 `ui/src/lib/api-client.ts`：`VITE_API_BASE_URL`（默认 `/api`）、JSON 编解码、后端 `ApiError` 到 `ApiRequestError` 的映射与网络错误处理。
- `api.ts` 中后端已实现的端点改为真实 HTTP：`getProfile`、`updateBasics`、`createFact`、`createFactManually`、`updateFact`、`listResumes`、`getResume`、`listResumeVersions`、`listJds`、`getJd`、`createJd`、`listTemplates`、`getTemplate`。
- 后端未实现的端点维持 mock：Agent Run、match-job、`parse*`、配置、PAT/访问日志、能力发现、备份预览，以及 workbench 中依赖 mock run 的部分。
- `vite.config.ts` 增加 `/api` → `http://localhost:8000` 开发代理；新增 `ui/.env.example`；更新 `ui/README.md` 对接说明。
- 用已安装的 MSW 为 Vitest 提供测试服务器：handlers 基于 `content.ts` fixtures，`test-setup.ts` 启停。
- React Query 不对 4xx 重试，避免 404 反复请求。

## Non-goals

- 不改后端、不新增后端端点。
- 不实现 Working Copy 保存流（结构化编辑器仍是本地状态）、对话解析、Agent Run 等未实现能力。
- 不改页面视觉，不涉及页面/组件样式改动。
- 不做生产部署配置（`/api` 反向代理属部署环境职责）。

## Acceptance Criteria

- [x] api-client 提供基地址、JSON 与 `ApiError` 映射；网络失败与 4xx/5xx 都产生 `ApiRequestError`。
- [x] profile、profile/basics、profile/facts（增改）、resumes（列表/详情/版本）、jds（列表/详情/创建）、templates（列表/详情）走真实 HTTP。
- [x] 未实现端点保持 mock，页面行为不变。
- [x] Vite 开发代理与 `.env.example` 就绪，README 说明后端启动与代理。
- [x] Vitest 通过 MSW 覆盖已对接端点，App 路由冒烟与 Profile 直接编辑测试仍通过。
- [x] `pnpm --dir ui run build`、`test`、`lint` 与 `archkit inspect .` 全部通过。

## Implementation

- HTTP 客户端：`ui/src/lib/api-client.ts` 定义 `API_BASE_URL`（`VITE_API_BASE_URL` 默认 `/api`）、`ApiRequestError`（携带 `code`/`status`/`latestVersionId`）与 `request<T>`；204 返回空、网络异常映射为 `NETWORK_ERROR`、非 2xx 解析后端 `{code,message}` 信封。
- `api.ts`：13 个已实现端点改为 `request()`；`updateBasics` 调用 `PATCH /profile/basics` 后取 `profile.basics`，保持原返回类型。移除 `RESUMES/JDS/TEMPLATES` 与 `createFactRecord` 等仅 mock 使用的代码。
- 保留 mock 的端点：Agent Run、match-job、`parseFactFromText`、`parseProfileInput`、`parseJdFromText/Image`、config、PAT/日志、capability、备份、workbench 中的 mock run 统计；`getWorkbenchSummary` 因此对 resumes/JD/profile 已自动走真实数据。
- 开发代理：`vite.config.ts` 增加 `server.proxy['/api']`，目标默认 `http://localhost:8000`，可用 `API_PROXY_TARGET` 覆盖；`rewrite` 去掉 `/api` 前缀。
- 测试：新增 `src/test-server.ts`（MSW handlers，返回 `content.ts` fixtures 与 404 信封）、`src/lib/api.test.ts`（成功、404 映射、网络错误）；`test-setup.ts` 启停 MSW。
- 缓存策略：`App.tsx` 的 QueryClient 对 4xx 不重试，其他失败最多重试 2 次。
- 文档：`ui/README.md` 增加后端启动与代理说明；`ui/.env.example` 记录 `VITE_API_BASE_URL` 与 `API_PROXY_TARGET`。

## Verification

- `pnpm --dir ui run build`：tsc + vite 构建成功，462.02 kB（gzip 134.92 kB）。
- `pnpm --dir ui run test`：3 个文件 28 passed（api 3、profile-workspace 6、App 路由冒烟与 404 19）。
- `pnpm --dir ui run lint`：0 warnings / 0 errors。
- 真实联调（worktree 后端跑在 127.0.0.1:8001，Vite 5173 代理指向它）：`/api/templates`、`/api/profile`、`/api/resumes`、`/api/jds` 全部 200；`POST /api/profile/facts` 写入真实后端并返回 `fact_*` 与 `unverified` 证据；`GET /api/resumes/does_not_exist` 返回 `{"code":"RESOURCE_NOT_FOUND","message":"简历 does_not_exist 不存在"}` 404。
- 说明：当前 8000 端口运行的是 main 分支旧后端（无业务路由），代理 `/api/health/` 返回 200 证明重写生效；合并后按 README 重启后端即可联通新路由。
- `archkit inspect .`：Quality gates passed。

## Related ADRs

- None.
