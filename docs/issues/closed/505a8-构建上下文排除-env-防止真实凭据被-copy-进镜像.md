---
id: 505a8
status: closed
created_at: 2026-10-09T16:16:07.369Z
updated_at: 2026-10-09T16:16:27.643Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 安全与配置
started_at: 2026-10-09T16:16:27.466Z
closed_at: 2026-10-09T16:16:27.643Z
---

# 构建上下文排除 .env：防止真实凭据被 COPY 进镜像

## Background

上一轮 compose 修复（19e5d）把 SMTP 变量透传进容器，但仍有一个未处理的密钥外泄面：`docker/Dockerfile.backend` 第 18 行是 `COPY backend/ ./`（整目录拷贝），而根 `.dockerignore` 没有任何 `.env` 排除规则。后果是构建镜像时会把本机 `backend/.env`（内含真实 Gmail SMTP 应用专用密码）固化进镜像层；同时 compose 透传的空 `SMTP_HOST` 会覆盖镜像内取值，导致容器的邮件来源既不安全也不透明。

## Scope

- 在 `.dockerignore` 排除 `.env`、`**/.env`、`**/.env.*`
- 在 `backend/tests/test_compose_contract.py` 增加可执行守卫：断言排除规则存在，且断言 Dockerfile 确为整目录拷贝（规则被改动时守卫会失效并报错）

## Non-goals

- 不改 `docker/Dockerfile.backend` 的拷贝结构（逐文件 COPY 另议）
- 不引入镜像层扫描或 CI 构建
- 不改启动自检与 compose 的既有约定（19e5d / 3ff68 已冻结）

## Acceptance Criteria

- [x] `.dockerignore` 含 `.env` 与 `**/.env`（覆盖 `backend/.env` 这类嵌套路径）
- [x] 契约测试断言排除规则与 Dockerfile 拷贝范围，且做过反向验证（摘掉规则该用例必须失败）
- [x] 全量后端测试与仓库门禁通过

## Implementation

- `.dockerignore`：新增注释说明原因，并加入 `.env` / `**/.env` / `**/.env.*` 三条规则
- `backend/tests/test_compose_contract.py`：新增 `test_build_context_excludes_env_files`，同时断言 `COPY backend/ ./`（若将来改成逐文件 COPY，该守卫会失败并提示复核）
- 提交信息里 `COPY backend/ ./` 因 shell 反引号被吞掉一处（信息其余部分完整，事实在 issue 与本文件内已完整记录）

## Verification

- 反向验证：临时摘掉三条排除规则 →
  `FAILED tests/test_compose_contract.py::test_build_context_excludes_env_files`（1 failed, 4 passed）
  恢复规则 → `5 passed`
- `node quality-gates/run.js` → `Quality gates passed.`
- `archkit inspect .` → `Quality gates passed.`

## Related ADRs

- None.
