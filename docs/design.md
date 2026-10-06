# 设计蓝图

> 本文件是系统的长期蓝图，描述设计哲学、架构、数据模型、目录结构与关键决策；具体工单从蓝图拆出，见 docs/issues/。

## 设计哲学

Resumate 采用同仓库前后端分离结构：`ui/` 提供 React 界面，`backend/` 提供 FastAPI 服务。后端以模块制提供 HTTP 能力，当前包含健康检查、模板只读接口，并按核心实体（Profile、Resume、JD）扩展业务域。

此外，`agent-core/` 提供内置与外部 Agent 复用的运行时底座，只通过公共 API 读写业务状态；`backend/app/modules/agent/` 承载 Agent 操作契约（UserTurn、Working Copy、PendingAction 与领域 Patch），接口与状态机以 [Agent 操作 API 契约](agent/agent-operation-api.md) 为准。

采用模块制组织 HTTP 能力，以明确的文件职责和显式依赖保持结构可追踪。基础设施探活使用 FastAPI 依赖；业务规则出现后，再在对应模块引入 service、dao 和 models。

## 架构

### 后端分层

| 位置（相对 backend/） | 职责 |
| --- | --- |
| `app/main.py` | 组合根，显式导入并注册各模块 router |
| `app/core/config.py` | Pydantic Settings，集中读取环境变量和 `.env`，缓存配置实例 |
| `app/core/db.py` | SQLAlchemy 引擎、会话工厂、请求会话依赖和数据库探活依赖 |
| `app/core/deps.py` | 分页参数依赖与 `CurrentUser` 传输类型 |
| `app/core/redis.py` | 进程级 Redis 客户端与 `get_redis` 依赖（会话存储） |
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

当前表：`users`（账号、密码哈希与封禁状态）、`roles` / `permissions` / `user_roles` / `role_permissions`（RBAC 三表与两张关联表）、`templates`（模板只读支撑）、`resumes` 与 `resume_versions`（简历资源与不可变内容版本）、`job_descriptions`（岗位与 0..1 软绑定）、`profiles` 与 `profile_facts`（职业事实库）、`user_settings`（用户偏好、Agent 配置与模型配置）、`personal_access_tokens` 与 `access_logs`（PAT 元数据与访问审计；只存令牌哈希）、`agent_turns`（UserTurn 与固化模式）、`agent_pending_actions`（审批待办）与 `agent_operations`（幂等结果）。事实反向引用通过扫描 `resume_versions.snapshot` 中的 `provenance.factId` 计算，JD 反向关联通过 `job_descriptions.bound_resume_id` 查询。

`resumes` 增补 `working_document` / `working_base_version_id` / `working_turn_id` / `working_revision` 四列承载 C-03 的 Working Copy：Agent 侧基于明确基线暂存，finalize 时才聚合为正式版本。

`resume_versions` 增补 `client_id` / `conversation_id` / `user_turn_id` / `agent_run_id` / `execution_mode` 五个可空列，承载 C-03 的版本溯源；Agent finalize 写入后可从版本追到来源轮次、客户端与固化模式。

会话不落在 PostgreSQL：Opaque Token 的 SHA-256 作为 Redis key（`auth:session:<sha256>`），用户维度用 `auth:user_sessions:<user_id>` 集合索引，删除 key 即撤销会话。Redis 不是事实源，丢失会话只影响登录态。

业务失败统一返回 `{code, message, latestVersionId?}` 错误信封，`code` 取自 `app/shared/errors.py` 的机器错误码；资源不存在返回 404、基线过期返回 409、校验失败返回 422。

## 目录结构

```text
.
├── agent-core/                 # Agent 底座（Python, uv）：公共 API 客户端、轮次会话、工具与 Skill
├── ui/                         # React + TypeScript + Vite
├── docker/                     # 容器构建：backend / ui 镜像、nginx 配置、后端入口脚本
├── compose.yaml                # 生产式容器编排（PostgreSQL + Redis + backend + ui）
├── scripts/dev.sh              # 本机一体化启动脚本（up / down / restart / status / logs）
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
│   │   │   ├── deps.py
│   │   │   └── redis.py
│   │   ├── modules/auth/          # 含 rbac.py：内置角色与权限目录
│   │   │   ├── api.py
│   │   │   ├── schemas.py
│   │   │   ├── service.py
│   │   │   ├── dao.py
│   │   │   ├── models.py
│   │   │   ├── deps.py
│   │   │   ├── security.py
│   │   │   └── session_store.py
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
│   │   ├── modules/access/
│   │   │   └── ...（api/schemas/service/dao/models）
│   │   ├── modules/backup/
│   │   │   └── ...（api/schemas/service）
│   │   ├── modules/agent/
│   │   │   └── ...（api/schemas/service/dao/models + patch.py）
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
│       ├── test_settings.py
│       ├── test_access.py
│       ├── test_access_control.py
│       ├── test_backup.py
│       ├── test_agent.py
│       └── test_auth.py
├── docs/design.md
├── docs/agent/agent-operation-api.md
├── docs/issues/
└── quality-gates/
```

Python 包目录包含 `__init__.py`，上图省略这些文件。

## 核心实体接口

当前公共端点（字段与 `ui/src/lib/types.ts` 对齐，JSON 使用 camelCase）：

- 认证与权限：`POST /auth/register`（202，建未验证账号并发验证邮件，不下发会话）、`POST /auth/verification/resend`（email 或 token 二选一，token 路径让失效链接页免输邮箱）、`POST /auth/verification/verify`（验证邮箱后才下发会话）、`POST /auth/login`（未验证邮箱返回 403 `EMAIL_NOT_VERIFIED`）、`POST /auth/logout`、`POST /auth/password`（登录后改密）、`POST /auth/password/forgot`（202 中性：命中账号才签发一次性重置链接，冷却或超配额时静默不发）、`POST /auth/password/reset`（消费一次性令牌换密并撤销该用户全部会话，失效返回 400 `PASSWORD_RESET_TOKEN_INVALID`）、`GET /auth/me`；用户：`GET /auth/users`（user:read）、`POST /auth/users/{id}/ban|unban`（user:ban/unban）、`POST /auth/users/{id}/role`（role:assign）。
- 角色目录：`GET|POST /auth/roles`、`PATCH|DELETE /auth/roles/{id}`（role:write）；权限目录只读：`GET /auth/permissions`。会话经 HttpOnly Cookie 承载。
- 模板：`GET /templates`、`GET /templates/{template_id}`（只读）。
- 简历：`GET /resumes`、`POST /resumes`、`GET /resumes/{resume_id}`、`PATCH /resumes/{resume_id}`、`DELETE /resumes/{resume_id}`、`POST /resumes/{resume_id}/archive`、`POST /resumes/{resume_id}/restore`、`POST /resumes/{resume_id}/duplicate`、`GET|PUT /resumes/{resume_id}/document`、`GET /resumes/{resume_id}/versions`。
- 岗位：`GET /jds`、`POST /jds`、`GET /jds/{jd_id}`、`PATCH /jds/{jd_id}`、`DELETE /jds/{jd_id}`、`PUT|DELETE /jds/{jd_id}/binding`。
- 资料：`GET /profile`、`PATCH /profile/basics`、`GET|POST /profile/facts`、`GET|PATCH|DELETE /profile/facts/{fact_id}`。
- 设置：`GET|PATCH /settings`（偏好）、`GET|PATCH /agent/config`、`GET|PUT /models/config`、`POST /models/config:test`、`GET /models/catalog`（models.dev 模型目录快照）。偏好中的 `fullAccessScopes`、`confirmRetainedOps`、`shortcuts[].action` 返回稳定 i18n 键而非展示文案。
- 开放接入：`GET|POST /access/tokens`、`POST /access/tokens/{token_id}/revoke`、`GET /access/logs`、`GET /.well-known/resume-agent`；令牌明文只在创建响应返回一次（`secretOnce`），库中只存 SHA-256 哈希。
- 备份：`GET /backup/export`、`GET /backup/export/markdown`、`POST /backup/import:preview`、`POST /backup/import`。
- Agent 操作：`POST /resumes/{resume_id}/turns`、`GET /turns/{turn_id}`、`POST /turns/{turn_id}/finalize|cancel`、`POST /turns/{turn_id}/patches:validate|preview|apply`、`GET /turns/{turn_id}/pending-actions`、`GET /resumes/{resume_id}/working-document`、`POST /pending-actions/{action_id}/approve|reject`、`GET /turns/{turn_id}/events`（SSE 轮次状态订阅，契约 §18：首帧 `snapshot`、真实变化推 `turn.updated`、注释心跳，反缓冲 header，断连即结束生成器）、`POST|GET /sessions`、`GET|POST /sessions/{session_id}/messages`、`GET|PUT /turns/{turn_id}/state`（会话层与 run checkpoint，契约 §19：会话按 owner 隔离、消息按 (session_id, seq) 幂等、checkpoint 用 stateVersion 乐观锁）；每个端点声明 `resume:read`（读）或 `resume:write`（写）。

## 关键决策

- 后端采用 FastAPI 模块制；业务域按需求增加，分层边界以本文为准。
- 核心实体 CRUD 按 Profile、Resume、JD 三个模块落地；手动 `PUT document` 直接产生一个 `ResumeVersion`，Agent 侧按 C-03 走 `agent_turns` 的 Working Copy + finalize 聚合提交（`manual-edits` 的手动缓冲仍留待后续工单）。
- Agent 操作层以 `app/modules/agent/` 落地：轮次固化执行模式（session > agent > account），approval 必须经 PendingAction 审批后 apply，full_access 可直接 apply；同一轮次重复 preview 会把既有 `pending` 待办置为 `stale`（「已被新的预览取代」）。finalize 每轮每份简历至多提交一个版本，无差异不建空版本，基线过期返回 409。领域 Patch 采用显式 `op` 列表（setBasics / upsertSection / removeSection / upsertEntry / removeEntry），非 RFC 6902；接口与状态机冻结在 `docs/agent/agent-operation-api.md`。
- `agent-core/` 是只走公共 API 的 Agent 底座（Python, uv）：薄客户端、TurnSession、Patch 构造器、工具表与 C-09 运行时骨架；**MUST NOT** 直连数据库或维护第二套业务真相源，模型提供方以 Protocol 注入。
- Agent 操作端点支持两种身份：HttpOnly 会话 Cookie（可信前端）与 `Authorization: Bearer rsm_pat_...`（PAT），Bearer 优先。PAT 走独立 Scope 强制，端点所需权限码不在令牌 scope 内返回 403 `SCOPE_INSUFFICIENT`；撤销返回 401 `TOKEN_REVOKED`，过期/未知返回 401 `UNAUTHENTICATED`，成功与拒绝各写一条 `access_logs`。PAT 请求的 `source` 按 agent 处理，`executionMode` 入参被忽略、只按 agent 配置/账户默认固化，防止用参数绕过审批；审批（approve / reject）是用户动作，仅限人类会话，PAT / Agent 来源一律 403 `FORBIDDEN` 并写审计。约定见 [Agent 操作 API 契约](agent/agent-operation-api.md) 第 13 节。MCP、SDK、Webhook 仍属后续工单。
- 模型目录来自开源目录 models.dev：刷新脚本把上游 api.json 投影为本地快照（id / name / limit / cost），运行时离线读取，仓库不自维护 provider / model 清单；provider 调用统一走 httpx 的 OpenAI 兼容 /chat/completions（`agent-core` 的 `OpenAICompatibleProvider`），不引入重 SDK；`/models/config` 的 provider / endpoint / model / key 全部可选，连通性测试经 httpx 且错误信息不含明文密钥。
- 基线被手动推进时，Agent 暂存改动按 C-06 做三方重排到新基线继续（响应 `baseRebased=true`）；冲突返回 409 `REBASE_CONFLICT` 且保留暂存（排队），`cancel` 与 begin 自动关闭为显式放弃路径、保证轮次可收场。
- 元数据修改（标题、标签、模板）不产生 Resume 版本；软删除保留 30 天恢复窗口。
- 健康检查没有业务规则，保留 `api.py + schemas.py` 两件套；数据库探活复用 `core/db.py` 的会话依赖。
- 认证采用 Opaque Token + Redis + HttpOnly Cookie：token 由 `secrets.token_urlsafe` 生成，Redis 只存其 SHA-256；每个请求都校验 Redis，删除 key 即立即失效。
- 会话 Cookie 默认 `HttpOnly`、`SameSite=lax`、`Path=/`、TTL 7 天；生产必须开启 `SESSION_COOKIE_SECURE=true`。开发经 Vite 代理为同源，无需 `SameSite=None`。
- `get_current_user` 由 `app/modules/auth/deps.py` 提供：读取 Cookie → 校验 Redis → 加载用户与 RBAC 投影并拒绝被封禁账号；业务模块从 auth.deps 导入，core 不反向依赖 modules。
- 权限采用经典 RBAC 三表：`users` / `roles` / `permissions` 三实体，`user_roles` / `role_permissions` 两张关联表；权限码为 `resource:action`，内置角色 `user` < `admin` < `super_admin` 通过权限集合表达继承（14 / 17 / 20 个权限）。目录定义在 `app/modules/auth/rbac.py`，由 `app.tasks.seed` 幂等写入并清理目录外的孤立权限；权限码与端点绑定、由代码静态声明，因此该目录只读，不提供在线增删改。
- 每个受保护端点通过 `require_permission("code")` 显式声明所需权限；守卫测试遍历 `app.routes` 断言非 public 路由恰好解析出一个存在于目录中的权限码，防止新增端点漏配。审批端点在此之外叠加 `require_human_session`，PAT / Agent 来源 403 `FORBIDDEN` 并写 `pat_human_session` 审计。public 白名单：health、register/login/logout、templates 只读、well-known、OpenAPI/docs。
- RBAC 管理界面为经典左树右表：左侧角色树（系统内置 / 自定义分组），右侧选中角色的详情与权限树三态勾选；系统角色只读。权限目录按资源分组。树用开源 headless 组件 `@headless-tree/react`（+ `@headless-tree/core` 提供 feature 与 `useTree`），本身不带样式，由项目 Tailwind 令牌渲染；权限文案按权限码映射到 i18n，不直接渲染后端中文名。
- RBAC 在线维护只针对**角色**：自定义角色可增删改，并从只读权限目录勾选权限；系统角色由 `app/modules/auth/rbac.py` 拥有，接口拒绝改/删，`seed_rbac` 会把系统角色的权限集合精确同步回目录值并清理孤立权限。权限码由代码静态声明（`require_permission` 导入期校验），UI 新建的权限码不会被任何端点使用，因此权限目录只读；角色 code 创建后不可变；删除仍被用户占用的角色返回 422。
- actor 与 target 的层级约束在 service 侧校验：封禁/解封要求 actor 角色 rank 严格高于 target（admin 不能动 admin/super_admin）；改角色仅 super_admin，且不能改自己、不能移除最后一个 super_admin。
- 密码使用 argon2 哈希；`app/tasks/seed.py` 幂等写入一个本地 bootstrap 管理员，部署前必须替换其密码。
- 会话撤销语义：登出删除当前会话 key；改密码与封号删除该用户 `auth:user_sessions` 索引下的全部会话 key，均在下一次请求立即生效。
- 统一错误契约放在 `app/shared/errors.py`，响应信封为 `ApiError`；`main.py` 注册异常处理器，各模块抛出领域异常而非手工构造状态码。
- 模板（`app/modules/templates/`）本期只提供只读查询，内置模板由 `app/tasks/seed.py` 幂等写入；模板发布与下架属于后续管理端需求。
- 设置按单用户唯一行 `user_settings` 承载：`preferences` / `agent_config` / `model_config` 各为 JSON 列；模型 API Key 由 `SETTINGS_SECRET_KEY` 派生的 Fernet 密钥加密落库、只写入不回显（仅返回 `keyConfigured`），解密失败按未配置处理；连通性测试由后端外呼并记录 `lastTest`，错误信息不含明文密钥。
- 快捷键映射在写入时做按键冲突校验（同一按键不可绑定多个动作），冲突返回 422 并保留原映射。
- 开放接入支持 PAT 签发、撤销、审计展示与请求鉴权：`Authorization: Bearer rsm_pat_...` 经 SHA-256 哈希查库校验（库中只存哈希），scope 与端点权限码同名、按集合强制，鉴权时更新 `last_used_at` 并写允许/拒绝审计。创建与撤销各写一条 `access_logs`（`purpose` 存稳定键，前端映射文案）。
- 备份以 `resumate-backup/1.0` JSON 为权威载荷，导入始终创建新资源并重映射 ID；因 Profile 为单用户唯一行，导入时复用已存在的 Profile 容器、事实作为新行写入。证据附件未落地，附件列表为空。
- UI 主题支持 `paper` / `dark` 双态：暗色令牌定义在 `ui/src/index.css` 的 `.dark`，由 `ThemeSync` 依偏好切换 `<html>` class；`ui/prototypes/index.html` 的「设计令牌」区块逐值复制这套 oklch 令牌（含 `.dark`），原型整体是 `ui/src` 的镜像。
- `APP_NAME` 配置应用标题，默认值为 `backend`；`main.py` 从 Settings 读取标题。
- 后端用 uv 管理依赖；测试通过 `TEST_DATABASE_URL`（默认 `resumate_test`）连接 PostgreSQL，每个测试在独立事务中运行并回滚，测试库与运行库隔离。
- 根目录 `archkit inspect .` 运行 generic 层与项目自定义 `ui-i18n`、`ui-form-contract`、`repo-privacy` 门禁；其通过不代表执行了 FastAPI 专项架构检查。后端分层由 `archkit guide -s fastapi`、代码审查与后端测试验证。
- 仓库是公开仓库：Git 跟踪的文本文件不得出现本机绝对路径（`/Users/<用户名>/`、`C:\Users\<用户名>\`、`/opt/homebrew/`）、个人邮箱域（gmail / 163 / qq / outlook 等）与内网 IP（`10.`、`172.16-31.`、`192.168.`），由 `quality-gates/gates/repo-privacy.js` 强制；改写为描述性写法或 `<本机用户名>` / `<接收方邮箱>` / `<内网地址>` 这类占位符，确属规则说明的行加 `privacy-allow` 标记。
- 表单与错误文案在客户端收口：含命名字段的表单必须接入 `useForm` + `zodResolver`，API 错误必须把机器错误码映射为 i18n 文案，不得直出服务端 `message`；由 `quality-gates/gates/ui-form-contract.js` 强制，遗留站点用行内 `form-allow` / `error-message-allow` 豁免标记登记。
- 前端界面文案由 i18next 管理，支持 `zh-CN` 与 `en`：语言选择持久化在 `localStorage`，启动时按「持久化 → 浏览器 → zh-CN」检测，切换同步 `html[lang]` 与文档标题；组件统一使用 `useTranslation()`，非 React 模块使用 `@/i18n` 单例。简历正文、JD 正文、事实内容与 Diff 原文属于用户内容，不随界面语言变化（US-13.4）。
- Agent 运行体采用**独立进程**形态，先以 CLI 落地（`agent-core` 提供可执行入口），后端后续 spawn 同一个入口；模型调用与 Agent 循环 **MUST NOT** 实现进后端（延续 C-09）。依据：独立进程强制运行体无状态（每一步都从持久化状态重建），且 CLI 是整个方案里不可逆性最低的形态——同一个入口将来既可被后端 spawn、也可被后端进程内调用、也可由用户自托管，业务逻辑无需改动。
- Agent 循环采用**步进式**：`/step` 从持久化状态出发推进到下一个断点（需要人类审批、预算耗尽或结束），并**每轮模型调用后落 checkpoint**（上下文消息与 RunBudget 计数）。依据：任何一步失败最多重跑一轮；断点即暂停且状态落库，人类动作后再续跑；用户关闭页面不影响推进。
- 会话层采用 **session + message** 命名与模型（对照 pi 的 session 树：entry 为树节点、message 只是其中一种 entry），**不采用 conversation + message**；存储抽成接口，首个实现落在库内。现状不一致需登记：`resume_versions.conversation_id` 与 `agent_run_id` 两列已存在但恒为空（`docs/agent/agent-operation-api.md` 自述「本期留空」），且不存在 `conversations` / `messages` 实体，因此契约中「切换 active_resume_id 先结算该会话上一轮」目前只能以「该简历的未关闭轮次」近似表达。
- 模型密钥（provider / endpoint / model / apiKey）**保留在后端加密存储**（`user_settings.model_config`，Fernet 加密、只写不回显），由后端按 run 临时交给运行体使用、用完即弃；运行体 **MUST NOT** 自持长期密钥，否则设置页的模型配置将失去意义。
- 审批的「人类在场」证明**维持现状**：`require_human_session` 以 `auth_kind != "pat"` 判定，即「持有有效会话 cookie 即视为人类」；本阶段**MUST NOT** 引入重输密码或后端二次确认签名。已知边界：cookie 可被扩展、脚本或同站 XSS 持有（叠加 `TurnSession.execute_patch` 在 approval 模式下自动 approve，等价于一次调用完成提案与批准）；缓解因素是 `SameSite=lax` 阻挡跨站 POST，且全仓暂无 CSRF 防护。**IF** 将来部署到公网、支持多用户且存在 XSS 面（UGC 渲染 / Markdown / 外链 / 富文本）-> **MUST** 增加 CSRF token 与显式 UI 动作来源标记；此触发条件记录于此，避免后续误判为遗漏。
