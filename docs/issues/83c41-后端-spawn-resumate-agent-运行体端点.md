---
id: 83c41
status: in-progress
created_at: 2026-10-01T04:00:00.000Z
updated_at: 2026-10-01T01:25:56.587Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 关键决策
started_at: 2026-10-01T01:25:56.587Z
---

# 后端 spawn resumate-agent 运行体端点

## Background

- 决策 1：运行体是独立进程（`resumate-agent` CLI）；后端 spawn 同一个入口，模型调用不在后端内实现。
- 模型密钥保留在后端加密存储（`user_settings.model_config`，Fernet），按 run 临时交给子进程、用完即弃。

## Scope

- 新增 `POST /resumes/{resume_id}/runs`（body: `prompt`、可选 `executionMode` / `sessionId`），权限 `resume:write` + 人类会话。
- 未配置模型（无 apiKey）→ 409 `MODEL_NOT_CONFIGURED`。
- 解密 apiKey 后经**环境变量**传给子进程（不进 argv）；身份用调用方会话 cookie（也走 env）；base-url 指向自身。
- 子进程硬超时（可配置）到点 kill 整个进程组；stdout/stderr 落可配置日志目录；日志不得包含 apiKey/cookie。
- 并发上限（可配置，进程内计数），超限返回 429 `RATE_LIMITED`。
- 返回 202 + 最小响应（不进 turnId）；轮次由子进程创建，前端用既有 `GET /resumes/{id}/turns?state=open` 与 SSE 发现。
- 契约 `docs/agent/agent-operation-api.md` 新增章节；README 端点计数同步。

## Non-goals

- 不做队列/worker、重试、前端接线。
- 不改模型密钥的加密存储方式；不改 approval 语义。
- 不合并回 main。

## Acceptance Criteria

- [ ] 用桩可执行文件验证：argv 与 env（apiKey/cookie 走 env）；202 `{status: started}`。
- [ ] 未配置模型 → 409 `MODEL_NOT_CONFIGURED`，不 spawn。
- [ ] 未知/越权简历 → 404；PAT 来源 → 403。
- [ ] 超时 kill 验证（子进程被终止、slot 释放、无僵尸）。
- [ ] 并发上限验证（超限 429）。
- [ ] 日志不含 apiKey/cookie，且子进程 env 不含后端自身敏感变量（DATABASE_URL / SETTINGS_SECRET_KEY）。
- [ ] `UV_INDEX_URL=https://pypi.org/simple uv run --directory backend pytest -q` 现有 187 条不退化；`archkit inspect .` 通过。

## Implementation

<!-- Complete after implementation. -->

## Verification

<!-- Add commands and results after verification. -->

## Related ADRs

- None.
