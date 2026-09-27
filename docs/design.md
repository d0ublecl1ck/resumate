# 设计蓝图

> 本文件是系统的长期蓝图，描述设计哲学、架构、数据模型、目录结构与关键决策；具体工单从蓝图拆出，见 docs/issues/。

## 设计哲学

Resumate 采用同仓库前后端分离结构：`ui/` 提供 React 界面，`backend/` 提供 FastAPI 服务。后端以模块制提供 HTTP 能力，当前包含健康检查、模板只读接口，并按核心实体（Profile、Resume、JD）扩展业务域。

采用模块制组织 HTTP 能力，以明确的文件职责和显式依赖保持结构可追踪。基础设施探活使用 FastAPI 依赖；业务规则出现后，再在对应模块引入 service、dao 和 models。

## 架构

### 后端分层

| 位置（相对 backend/） | 职责 |
| --- | --- |
| `app/main.py` | 组合根，显式导入并注册各模块 router |
| `app/core/config.py` | Pydantic Settings，集中读取环境变量和 `.env`，缓存配置实例 |
| `app/core/db.py` | SQLAlchemy 引擎、会话工厂、请求会话依赖和数据库探活依赖 |
| `app/core/deps.py` | 分页参数依赖与单用户占位依赖 |
| `app/modules/<domain>/api.py` | HTTP 路由、依赖声明、请求绑定及响应映射 |
| `app/modules/<domain>/schemas.py` | 显式请求和响应契约 |
| `app/modules/<domain>/service.py` | 业务规则、状态流转与跨 DAO 编排 |
| `app/modules/<domain>/dao.py` | 持久化访问，不决定展示内容或 HTTP 状态 |
| `app/modules/<domain>/models.py` | SQLAlchemy ORM 模型 |
| `app/shared/` | 两个以上模块复用的领域 schema、错误契约和工具 |
| `app/jobs/`、`app/tasks/` | 长时或定时作业、小任务入口 |

- **WHEN** 实现 HTTP 接口 -> **MUST** 按领域放入 `app/modules/<domain>/`，路由仅处理传输语义，数据库访问放在 DAO 或基础设施依赖。
- **WHEN** 模块需要业务规则和持久化 -> **MUST** 在模块内按 `api → service → dao → models` 组织；service **MUST NOT** 依赖 FastAPI 传输对象，DAO **MUST NOT** 决定展示内容或 HTTP 状态码。
- **WHEN** 编写 `core` 或 `shared` -> **MUST NOT** 反向导入 `modules`；共享领域对象需至少两个模块复用。
- **WHEN** 注册 router -> **MUST** 在 `app/main.py` 显式注册，**MUST NOT** 运行时扫描目录。

### 健康检查流程

`GET /health/ → check_database_connection → get_db → SELECT 1 → HealthResponse`

`check_database_connection` 位于 `app/core/db.py`，以同步依赖运行 SQL，避免在异步路由中阻塞事件循环。`get_db` 在请求结束后关闭会话。路由仅构造响应模型。

数据库可用时返回 `200 {"status":"ok"}`；连接或查询失败时异常交由框架处理，默认返回 `500 Internal Server Error`。因此该接口检查应用与数据库就绪状态。OpenAPI 位于 `/openapi.json`，交互文档位于 `/docs`。

## 数据模型

运行数据库为 PostgreSQL，驱动使用 psycopg 3（`postgresql+psycopg://`）。`DATABASE_URL` 由 Settings 读取，默认 `postgresql+psycopg://localhost:5432/resumate`；本地开发另需 `resumate_test` 测试库。

`app/core/db.py` 定义声明式 `Base`。业务模型继承 `Base`，按领域放在 `app/modules/<domain>/models.py`，并在 `migrations/env.py` 显式导入以便 Alembic 自动生成迁移；`migrations/versions/` 保存迁移。嵌套结构（文档章节、模板校验错误、证据等）使用 JSON 列，主键为应用层生成的 UUID 字符串，时间戳统一使用带时区的 UTC 值。

当前表：`templates`（模板只读支撑）、`resumes` 与 `resume_versions`（简历资源与不可变内容版本）、`job_descriptions`（岗位与 0..1 软绑定）、`profiles` 与 `profile_facts`（职业事实库）、`user_settings`（用户偏好、Agent 配置与模型配置）。事实反向引用通过扫描 `resume_versions.snapshot` 中的 `provenance.factId` 计算，JD 反向关联通过 `job_descriptions.bound_resume_id` 查询。

业务失败统一返回 `{code, message, latestVersionId?}` 错误信封，`code` 取自 `app/shared/errors.py` 的机器错误码；资源不存在返回 404、基线过期返回 409、校验失败返回 422。

## 目录结构

```text
.
├── ui/                         # React + TypeScript + Vite
├── backend/
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── README.md
│   ├── .env.example
│   ├── alembic.ini
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── db.py
│   │   │   └── deps.py
│   │   ├── modules/health/
│   │   │   ├── api.py
│   │   │   └── schemas.py
│   │   ├── modules/templates/
│   │   │   ├── api.py
│   │   │   ├── schemas.py
│   │   │   ├── service.py
│   │   │   ├── dao.py
│   │   │   └── models.py
│   │   ├── modules/resume/
│   │   │   ├── api.py
│   │   │   ├── schemas.py
│   │   │   ├── service.py
│   │   │   ├── dao.py
│   │   │   └── models.py
│   │   ├── modules/jd/
│   │   │   └── ...（api/schemas/service/dao/models）
│   │   ├── modules/profile/
│   │   │   └── ...（api/schemas/service/dao/models）
│   │   ├── modules/settings/
│   │   │   └── ...（api/schemas/service/dao/models）
│   │   ├── shared/
│   │   │   ├── schemas.py
│   │   │   └── errors.py
│   │   ├── jobs/
│   │   └── tasks/
│   │       └── seed.py
│   ├── migrations/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   └── tests/
│       ├── conftest.py
│       ├── test_health.py
│       ├── test_deps.py
│       ├── test_templates.py
│       ├── test_resume.py
│       ├── test_jd.py
│       ├── test_profile.py
│       └── test_settings.py
├── docs/design.md
├── docs/issues/
└── quality-gates/
```

Python 包目录包含 `__init__.py`，上图省略这些文件。

## 核心实体接口

当前公共端点（字段与 `ui/src/lib/types.ts` 对齐，JSON 使用 camelCase）：

- 模板：`GET /templates`、`GET /templates/{template_id}`（只读）。
- 简历：`GET /resumes`、`POST /resumes`、`GET /resumes/{resume_id}`、`PATCH /resumes/{resume_id}`、`DELETE /resumes/{resume_id}`、`POST /resumes/{resume_id}/archive`、`POST /resumes/{resume_id}/restore`、`POST /resumes/{resume_id}/duplicate`、`GET|PUT /resumes/{resume_id}/document`、`GET /resumes/{resume_id}/versions`。
- 岗位：`GET /jds`、`POST /jds`、`GET /jds/{jd_id}`、`PATCH /jds/{jd_id}`、`DELETE /jds/{jd_id}`、`PUT|DELETE /jds/{jd_id}/binding`。
- 资料：`GET /profile`、`PATCH /profile/basics`、`GET|POST /profile/facts`、`GET|PATCH|DELETE /profile/facts/{fact_id}`。
- 设置：`GET|PATCH /settings`（偏好）、`GET|PATCH /agent/config`、`GET|PUT /models/config`、`POST /models/config:test`。

## 关键决策

- 后端采用 FastAPI 模块制；业务域按需求增加，分层边界以本文为准。
- 核心实体 CRUD 按 Profile、Resume、JD 三个模块落地；简历文档提交（`PUT document`）直接产生一个 `ResumeVersion`，Working Copy / flush / finalize 的完整 C-03 模型留待后续工单。
- 元数据修改（标题、标签、模板）不产生 Resume 版本；软删除保留 30 天恢复窗口。
- 健康检查没有业务规则，保留 `api.py + schemas.py` 两件套；数据库探活复用 `core/db.py` 的会话依赖。
- `get_current_user` 为单用户占位依赖，固定返回本地用户；接入真实认证前不得多用户部署。
- 统一错误契约放在 `app/shared/errors.py`，响应信封为 `ApiError`；`main.py` 注册异常处理器，各模块抛出领域异常而非手工构造状态码。
- 模板（`app/modules/templates/`）本期只提供只读查询，内置模板由 `app/tasks/seed.py` 幂等写入；模板发布与下架属于后续管理端需求。
- 设置按单用户唯一行 `user_settings` 承载：`preferences` / `agent_config` / `model_config` 各为 JSON 列；模型 API Key 只写入、不回显（仅返回 `keyConfigured`），连通性测试由后端外呼并记录 `lastTest`，错误信息不含明文密钥。
- `APP_NAME` 配置应用标题，默认值为 `backend`；`main.py` 从 Settings 读取标题。
- 后端用 uv 管理依赖；测试通过 `TEST_DATABASE_URL`（默认 `resumate_test`）连接 PostgreSQL，每个测试在独立事务中运行并回滚，测试库与运行库隔离。
- 根目录 `archkit inspect .` 当前运行 generic 层门禁；其通过不代表执行了 FastAPI 专项架构检查。后端分层由 `archkit guide -s fastapi`、代码审查与后端测试验证。
