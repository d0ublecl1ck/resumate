---
id: 38cb0
status: closed
created_at: 2026-09-15T01:45:42.399Z
updated_at: 2026-09-15T01:49:11.694Z
priority: medium
labels: []
parent: null
blocked_by: []
design_section: 架构
started_at: 2026-09-15T01:45:57.125Z
closed_at: 2026-09-15T01:49:11.694Z
---

# 重建 FastAPI 后端初始架构

## Background

重建 backend 初始架构，使用模块制组织 HTTP 能力，并提供可运行的配置、数据库依赖、健康检查和迁移环境。

## Scope

- 替换 backend，包含 core、modules/health、shared、jobs、tasks、migrations 和 tests。
- 配置 uv 项目依赖、环境变量示例及 Alembic；验证健康检查与隔离数据库迁移。
- 同步项目蓝图和使用说明，运行根质量门禁。

## Non-goals

- 不修改前端或新增业务模块。

## Acceptance Criteria

- [x] backend 包含完整模块制目录、显式路由注册及同步数据库探活依赖。
- [x] `uv run --directory backend pytest` 通过；`DATABASE_URL=sqlite:// uv run --directory backend alembic upgrade head` 成功。
- [x] 蓝图反映已配置 Alembic 及 APP_NAME 生效；archkit inspect 通过。

## Implementation

重建 backend 模块制初始工程，配置 Alembic、声明式 Base、环境变量示例、依赖锁文件与隔离数据库测试。应用标题读取 APP_NAME，健康响应状态由 Literal 类型约束。同步根 README 与项目蓝图，工单说明统一以仓库内结构、行为和可复现命令描述。

任务清单：
- [x] 确认工作区干净、旧后端范围与用户替换授权。
- [x] 删除并重新生成后端。
- [x] 验证、同步文档并归档。

## Verification

- `uv run --directory backend pytest`：3 passed，覆盖健康响应、OpenAPI 与数据库失败路径。
- `DATABASE_URL=sqlite:// uv run --directory backend alembic upgrade head`：退出码 0，使用内存数据库。
- `archkit inspect .`：Quality gates passed，执行根 generic 门禁。
- 检查后端目录、导入方向、显式 router 注册、同步探活依赖及 README/蓝图的一致性，通过。

## Related ADRs

- None.
