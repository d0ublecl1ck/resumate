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

A11 面试能力新增十一张表：`interview_sessions` / `interview_questions` / `interview_answers` / `interview_reports`（模拟面试闭环，评分量表版本随会话冻结）、`bank_questions`（岗位题库，`(role, prompt_hash)` 唯一去重）、`kb_documents` / `kb_chunks`（知识库文档与检索切片）、`speech_segments`（语音作答的实测指标，原始音频不落库）、`quiz_attempts` / `quiz_answers`（笔试与逐题判分）、`practice_items`（练习项与复测绑定）。字段与口径见「[A11 面试与能力提升](#a11-面试与能力提升)」。

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
│   │   ├── modules/interview/   # A11 模拟面试闭环
│   │   │   └── ...（api/schemas/service/dao/models + llm.py）
│   │   ├── modules/bank/        # A11 岗位题库
│   │   │   └── ...（api/schemas/service/dao/models）
│   │   ├── modules/kb/          # A11 知识库（corpus/ 为自建种子语料）
│   │   │   └── ...（api/schemas/service/dao/models + backfill.py）
│   │   ├── modules/speech/      # A11 语音作答指标
│   │   │   └── ...（api/schemas/service/dao/models + dashscope_asr.py）
│   │   ├── modules/quiz/        # A11 笔试与判分
│   │   │   └── ...（api/schemas/service/dao/models + seed.py）
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
- 岗位：`GET /jds`、`POST /jds`、`GET /jds/{jd_id}`、`PATCH /jds/{jd_id}`、`DELETE /jds/{jd_id}`、`PUT|DELETE /jds/{jd_id}/binding`、`POST /jds:parse-text`（`jd:write`，用用户已配置的模型把粘贴文本结构化成 `ProposedJd` 草案；失败码 `MODEL_NOT_CONFIGURED`(409) / `UPSTREAM_TIMEOUT`(504) / `UPSTREAM_REJECTED`(502) / `MODEL_OUTPUT_INVALID`(502) / `VALIDATION_FAILED`(422)）。
- 资料：`GET /profile`、`PATCH /profile/basics`、`GET|POST /profile/facts`、`GET|PATCH|DELETE /profile/facts/{fact_id}`。
- 设置：`GET|PATCH /settings`（偏好）、`GET|PATCH /agent/config`、`GET|PUT /models/config`、`POST /models/config:test`、`GET /models/catalog`（models.dev 模型目录快照）。偏好中的 `fullAccessScopes`、`confirmRetainedOps`、`shortcuts[].action` 返回稳定 i18n 键而非展示文案。
- 开放接入：`GET|POST /access/tokens`、`POST /access/tokens/{token_id}/revoke`、`GET /access/logs`、`GET /.well-known/resume-agent`；令牌明文只在创建响应返回一次（`secretOnce`），库中只存 SHA-256 哈希。`GET /access/logs` 接受可选查询参数 `page`/`size`（复用 `core/deps.py` 的 `get_pagination`，默认 20，page>=1、size 1..100，越界 422）、`purpose`、`result`（`allowed`/`denied`/`frozen`，非法值 422）、`q`（大小写不敏感匹配 `client_id`/`scope`/`resource`）；筛选后按 `at` 倒序，响应体仍是按页的 `AccessLogResponse` 裸数组，筛选后的总条数放在 `X-Total-Count` 响应头，`access:read` 权限语义不变。
- 备份：`GET /backup/export`、`GET /backup/export/markdown`、`POST /backup/import:preview`、`POST /backup/import`。
- Agent 操作：`POST /resumes/{resume_id}/turns`、`GET /turns/{turn_id}`、`POST /turns/{turn_id}/finalize|cancel`、`POST /turns/{turn_id}/patches:validate|preview|apply`、`GET /turns/{turn_id}/pending-actions`、`GET /resumes/{resume_id}/working-document`、`POST /pending-actions/{action_id}/approve|reject`、`GET /turns/{turn_id}/events`（SSE 轮次状态订阅，契约 §18：首帧 `snapshot`、真实变化推 `turn.updated`、注释心跳，反缓冲 header，断连即结束生成器）、`POST|GET /sessions`、`GET|POST /sessions/{session_id}/messages`、`GET|PUT /turns/{turn_id}/state`（会话层与 run checkpoint，契约 §19：会话按 owner 隔离、消息按 (session_id, seq) 幂等、checkpoint 用 stateVersion 乐观锁）；每个端点声明 `resume:read`（读）或 `resume:write`（写）。
- 面试与题库（A11）：面试闭环 `GET|POST /interview/sessions`、`GET /interview/sessions/{session_id}`、`POST /interview/sessions/{session_id}/answers|finish`、`GET /interview/sessions/{session_id}/report`、`GET /interview/sessions/{session_id}/report/export`；数据聚合 `GET /interview/growth`、`GET /interview/comparison`、`GET|POST /interview/practice-items`、`PATCH|DELETE /interview/practice-items/{item_id}`、`POST /interview/practice-items/{item_id}/retest`、`POST /interview/sessions/{session_id}/regenerate`、`GET /interview/insights`；语音 `POST /speech/transcribe`、`POST /speech/synthesize`、`POST|GET /speech/segments`；笔试 `POST /quiz/attempts`、`GET /quiz/attempts/{attempt_id}`、`POST /quiz/attempts/{attempt_id}/answers|submit`；岗位题库 `GET /bank/stats`、`GET /bank/questions`（筛选后总数放 `X-Total-Count` 响应头）、`POST /bank/import`；知识库 `GET|POST /kb/documents`、`GET /kb/search`。权限沿用岗位域 `jd:read` / `jd:write`（面试 / 语音 / 笔试 / 聚合）与通用 `resume:read` / `resume:write`（题库 / 知识库），不新增权限码。细节见「[A11 面试与能力提升](#a11-面试与能力提升)」。

## A11 面试与能力提升

A11 的面试能力与岗位题库：一场面试冻结上下文快照，逐题作答并按需追问，结束时冻结一份带证据的结构化评估；题库与知识库为出题与练习提供素材。本节只登记已确定并落地的接口与口径，尚未落地的部分在各自的「当前边界」里登记，不写成已完成。

### AI 模拟面试闭环（已实现）

| 方法与路径 | 语义 |
| --- | --- |
| `GET /interview/sessions` | 当前用户的场次摘要列表；`questionCount`、`answeredCount`、`hasReport` 按库内数据实时聚合 |
| `POST /interview/sessions` | 建场：固定简历版本与 JD 快照并生成首批题目；`questionCount` 省略时 4，取值区间 3–5；可选 `difficulty` 与 `kinds` 筛选，不传即不限 |
| `GET /interview/sessions/{session_id}` | 场次详情：冻结上下文、题目（含追问与已作答内容）、报告（尚未生成时 `report` 为 null） |
| `POST /interview/sessions/{session_id}/answers` | 提交一条文字作答，返回落库的作答与本次新产生的追问（没有追问时为 null） |
| `POST /interview/sessions/{session_id}/finish` | 生成并冻结评估报告，场次转 `completed` |
| `GET /interview/sessions/{session_id}/report` | 读取已生成的报告；尚未生成返回 404 |
| `GET /interview/sessions/{session_id}/report/export` | 导出报告为 Markdown 附件（`format` 只接受 `markdown`，传 `pdf` 走 422）；文件名按 RFC 5987 同时给 ASCII 回退名与 UTF-8 名。已用真实 HTTP 复验：`format=markdown` 返回 200、正文首行是 `# 面试评估报告 · …` 且含「量表版本：interview-rubric-v1（已冻结）」，`format=pdf` 返回 422 `VALIDATION_FAILED`（message 指明 `format`） |

数据承载：

| 表 | 承载 |
| --- | --- |
| `interview_sessions` | 一场面试：owner、简历与版本、JD、岗位、`status`（`active` / `completed`）、`rubric_version`、`context_snapshot`（冻结上下文） |
| `interview_questions` | 题目：`ordinal`、`kind`（`technical` / `deep_dive` / `scenario` / `behavioral` / `follow_up`，历史行里可能仍是旧别名 `situational`）、题干、`reference_points` 要点、`knowledge_refs`（出题时按题干检索知识库回填的出处，无命中为空数组）、`parent_question_id`（追问指向主问题）、`derived_from_answer_id` |
| `interview_answers` | 文字作答；`(question_id, idempotency_key)` 唯一 |
| `interview_reports` | 结构化评估：`content_scores`、`summary`、`highlights`、`gaps`、`suggestions`；`session_id` 唯一 |

闭环口径：

- **会话**：建场时校验简历版本属于当前用户、简历未软删除、JD 属于当前用户；把 `role` / `resumeTitle` / `resumeVersionId` / `jdRole` / `jdCompany` / `jdBody` / `capturedAt` 写进 `context_snapshot`（简历完整快照只落库、不对外返回）。此后题目、追问与评估一律基于该快照，不再读取简历 / JD 的最新值。
- **题目**：由一次模型调用生成，四类题为 `technical` / `deep_dive` / `scenario` / `behavioral`；旧别名 `situational` 在入参校验时归一为 `scenario`，落库前不再出现。题型不在白名单时归为 `technical` 并记 warning，若全部题型非法或有效题目不足 3 道，返回 502 `MODEL_OUTPUT_INVALID`。`difficulty` 与 `kinds` 是可选筛选（空数组等同不传），建场时随会话冻结；`POST /interview/sessions/{session_id}/regenerate` 只在未作答场次生效（已作答或已结束一律 409），可选新筛选覆盖冻结值，**不改写已有场次的题目快照**。生成后按每道题的题干检索知识库，把命中的出处写进 `knowledge_refs`；没有命中的题保持为空数组，不伪造引用。
- **作答**：按 `(question_id, idempotency_key)` 幂等；`idempotencyKey` 省略时服务端按 `sha256(questionId + 换行 + content)` 派生，并靠唯一约束兜住并发重复提交，重复提交原样返回已落库的那一条，不重复建记录。场次已结束时继续作答返回 409 `RUN_STATE_CONFLICT`。
- **追问**：每条主问题最多追加一条追问；追问由作答内容推导，失败（未配置模型 / 输出非法 / 上游拒绝 / 上游超时）只跳过追问，已落库的作答不受影响，`followUpQuestion` 返回 null。
- **评估**：结束时固定输出 `correctness` / `depth` / `rigor` / `fit` 四个维度（顺序固定）；模型给出的证据必须逐字出自候选人的作答原话——服务端去掉空白与首尾引号、句末标点后做包含比对，允许只引用原话前半段，短于 8 字的引用不作为证据。证据核对不通过的维度记为 `score=null`（不给 0 分）；四个维度都没有可核对证据时整体返回 502 `MODEL_OUTPUT_INVALID`；没有任何作答时 `finish` 返回 422 `VALIDATION_FAILED`。`finish` 幂等，重复调用返回同一份报告。
- **权限与错误**：所有端点要求登录，读用 `jd:read`、写用 `jd:write`；不属于当前用户的场次与题目按 404 处理。模型侧失败沿用共享错误信封：未配置模型 409 `MODEL_NOT_CONFIGURED`、上游超时 504 `UPSTREAM_TIMEOUT`、上游拒绝 502 `UPSTREAM_REJECTED`、模型输出非法 502 `MODEL_OUTPUT_INVALID`。

**当前边界**：

- 面试闭环本身只处理文字作答；语音指标、笔试与跨场次聚合分别落在下面各节，各自带自己的边界。
- 追问依赖模型的额外一次调用，模型失败时该主问题没有追问，调用方必须按 null 处理。

### 岗位题库与知识库

题库（已实现）：

| 方法与路径 | 语义 |
| --- | --- |
| `GET /bank/stats` | 按岗位聚合的真实题数：`{roles: [{role, total, kinds}], total}`；可选 `role` 过滤 |
| `GET /bank/questions` | 分页题目列表，响应体是裸数组，筛选后的总数放在 `X-Total-Count` 响应头；可选 `role` / `kind` / `difficulty` / `q`，分页参数复用 `core/deps.py` 的 `get_pagination` |
| `POST /bank/import` | 批量导入题库，单次请求最多 500 条，201 返回 `{created, skipped}` 真实计数 |

- 数据模型 `bank_questions`：`role`、`kind`（`technical` / `deep_dive` / `scenario` / `behavioral`）、`difficulty`（`easy` / `medium` / `hard`）、`prompt`、`reference_points`、`knowledge_refs`（可空，对外统一收敛成空数组）、`source`（`seed_model` / `import`）、`batch_id`、`prompt_hash`。
- 去重口径固定为「去掉全部空白字符后取 sha256」，生成脚本与导入接口共用 `prompt_hash`，因此 `(role, prompt_hash)` 唯一：同一条题干不会因换行或空格差异重复入库。
- 题目由 `backend/scripts/generate_bank.py` 调用户已配置的模型生成：Java 后端与 Web 前端各 100 题（`technical` 48 / `deep_dive` 24 / `scenario` 16 / `behavioral` 12，两个岗位共 200 题），难度按脚本内的 `DIFFICULTY_PLAN` 拆分；脚本幂等可续跑，已存在的 `(role, prompt_hash)` 直接跳过，结束时写真实计数日志。
- 题库屏（`ui/src/features/interview/bank-screen.tsx`，路由 `/interview/bank`）调用真实 `/bank/stats` 与 `/bank/questions`，页面不再内置 mock 数据。具体路径必须注册在 `interview/:id` 之前，否则会被参数路由吞掉（漏接线的修复见 `ui/src/App.tsx`）。
- `knowledge_refs` 为空的语义是「没有依据」，界面与后续生成都不得伪造知识库引用（US-14.2）。

知识库（已实现）：

| 方法与路径 | 语义 |
| --- | --- |
| `GET /kb/documents` | 按岗位列出已导入的文档；可选 `role` 过滤 |
| `POST /kb/documents` | 导入一份 Markdown / 纯文本文档，服务端切片后落库，201 返回 `chunkCount` |
| `GET /kb/search` | 按 `q` + `role` 检索切片；`limit` 1..20（默认 5）；命中返回 `status=matched`，无命中返回 `status=no_match` 且 `results=[]` |

- 数据模型：`kb_documents`（`title`、`role`、`source_type`、`body`、`chunk_count`）与 `kb_chunks`（`document_id`、`ordinal`、`heading`、`content`、`char_count`）；切片是检索的最小单位，岗位隔离在文档侧过滤。
- 切片规则：Markdown 按 `#` 标题分节（顶层标题下的首段归该节），纯文本整篇一节；节内按空行分段并累积到 `MAX_CHUNK_CHARS = 700`，超长段落按句末标点切、单句仍超长则定长硬切。
- 检索口径：检索文本是「文档标题 + 小节标题 + 正文」，中文按字符 bigram、英文数字按小写词，BM25（k1=1.2、b=0.75）打分；只返回 `score > 0` 且覆盖率达标的切片，按（分数降序，chunk id 升序）排序，保证同数据同查询结果完全一致。
- 覆盖率分两档，是全文唯一按查询长度分档的阈值：查询词 ≤ 6 个时按精确查找处理，要求覆盖率 ≥ `SHORT_QUERY_COVERAGE = 0.7`；更长的自然语言问句里虚词 bigram 占多数、比例天然被稀释，沿用 `MIN_QUERY_COVERAGE = 0.05` 的低下限。实测依据：统一取 0.5 / 0.7 会把题干回填召回打成 0/200，分档后 200/200，同时 `不存在的词zzz` 这类偶然重合判为 `no_match`。
- 语料：`backend/app/modules/kb/corpus/<role-slug>/<topic>.md` 下的 35 篇自建种子语料（非外部摘抄，覆盖 Java 后端与 Web 前端两个岗位），由 `backend/scripts/seed_kb_corpus.py` 幂等导入（按 `(title, role)` 去重）；`--coverage` 在只读事务里模拟回填并输出真实覆盖率。
- 回填：`backend/scripts/backfill_knowledge_refs.py` 与 `app/modules/kb/backfill.py` 按「题干 + role」检索，命中才把切片出处写进 `bank_questions.knowledge_refs`（每次最多 `DEFAULT_REF_LIMIT = 3` 条）；未命中的题保持为空，`--force` 重算也不保留任何假引用。

**当前边界**：文档标题与小节标题虽然进入检索文本，但不享有权重加成——长切片里高频出现的词会压过标题命中（实测 q=Redis 的 top1 是 Gateway 限流切片，Redis 专文排在 2 / 4 / 5）；标题权重按独立工单修正。长查询沿用 0.05 的弱下限，只共享一两个通用 bigram 的弱尾命中仍可能被判为命中，这是已登记的边界；主题缺口（例如 `@RefreshScope` 这类细分考点）靠补语料解决，不放宽阈值。

### 语音作答链路（已实现）

| 方法与路径 | 语义 |
| --- | --- |
| `POST /speech/transcribe` | 把浏览器录音（base64 JSON，单次 ≤ 10 MB）交给云端 ASR（DashScope Paraformer），返回转写文本、总时长与词 / 句级时间戳；音频只在内存中流转，不落盘、不保留副本 |
| `POST /speech/synthesize` | 把题干文本交给云端 TTS（qwen3-tts-flash，默认音色 Cherry）合成，服务端取回音频后**直接回传字节**而不是一过性签名 URL；`format` 目前只接受 `wav`，传其它值 422，音频同样不落盘 |
| `POST /speech/segments` | 落一段真实录音作答的时长与转写，返回服务端重算的指标；`durationSeconds` 必须 > 0（没有真实音频就没有可复算的语速，0 秒返回 422 而不是伪造 0 字/分） |
| `GET /speech/segments` | 按 `sessionId` 读回该场次的语音指标 |

- 数据模型 `speech_segments`：`owner_id`、可选 `session_id` / `question_id`、`duration_seconds`、`transcript`、`char_count`、`pace_chars_per_min`、`filler_count`、`pause_count`、`clarity_score` / `clarity_level`、`provider`、`timing_source`、`speech_duration_seconds`。`session_id` / `question_id` 只是回指；没有真实录音就不会有行，报告侧据此显示「不适用」。
- 语速（可复核定义）：**语速 = 字数 ÷ 时长**，单位「字/分」。字数按 `[\u4e00-\u9fffA-Za-z0-9]` 统计（不计标点与空白），两边都取自落库的转写与时长，任意一方都能独立复核同一个值。拿到词 / 句级时间戳时时长改用「发声跨度」（首个时间单元开始到最后一个结束），`timing_source` 如实标注 `timestamps` 还是 `duration`，不把录音时长算的说成时间戳算的。
- 停顿：时间戳口径下相邻单元间隔严格大于 `PAUSE_GAP_MS = 600` 记一次；浏览器端没有时间戳时用 Web Audio 静音检测的 `pauseCount`。
- 清晰度是**代理指标**，不是声学评分：由填充词率（`filler_count / char_count`，每 1% 扣 6 分、最多扣 60）与停顿率（停顿次数 / 分钟，每次扣 1.2 分、最多扣 40）从 100 分折算，`good ≥ 80`、`fair ≥ 60`、否则 `needs_work`。转写为空或时长不可用时 `pace` / `clarity` 一律为 null，绝不落 0，也不虚构音频指标（US-14.4）。
- 云端链路：ASR 走 DashScope Paraformer（带字级时间戳），播报走云端 TTS，素材都只在内存里流转；上游失败统一映射到仓库既有错误码，日志与响应不含密钥或上游原文。
- 降级链：云端 ASR / 云端 TTS → 浏览器实时识别 → 手动输入文字；麦克风被拒、未配置密钥或上游失败时如实标注「不可用，已降级为纯文字」（前端映射错误码成文案，不直出原始报错），题干文本与既有面试上下文始终保留（US-14.6）。
- 故障演练：语音屏提供「模拟语音服务不可用」开关（界面标注「故障演练中：已跳过云端转写与云端播报」），用于在真实链路上验证降级分支；这是前端的显式演练开关，不会真的打断上游服务。

**当前边界**：TTS 只支持 `wav` 与固定模型 / 默认音色，多音色与格式选择未开放；云端密钥按环境变量注入，密钥缺失时按「未配置」降级而不是报错；故障演练只覆盖前端开关，没做上游真实的故障注入（超时、限流、半开）。

### 笔试模块（已实现）

| 方法与路径 | 语义 |
| --- | --- |
| `POST /quiz/attempts` | 按岗位与题型分组抽题（每个分组抽一道），把题目与客观题答案键一起冻结进 `questions_snapshot` |
| `GET /quiz/attempts/{attempt_id}` | 读取当前笔试、已作答与判分结果 |
| `POST /quiz/attempts/{attempt_id}/answers` | 提交一条作答并当场判分；`(question_id, idempotency_key)` 幂等 |
| `POST /quiz/attempts/{attempt_id}/submit` | 交卷：冻结 `total_score` / `policy` / `submitted_at`，重复提交返回同一份结果 |

- 数据模型：`quiz_attempts`（`role`、`status`（`in_progress` / `submitted`）、`question_types`、`questions_snapshot`、`max_score`、`total_score`、`policy`、`submitted_at`）与 `quiz_answers`（`attempt_id`、`question_id`、`question_group`、`question_kind`、`answer_payload`、`awarded_points`、`max_points`、`verdict`、`feedback`、`executed`）；`(question_id, idempotency_key)` 唯一，重复提交只落一条。
- 答案键不下发：出题响应显式剥离 `correctOptionIds`，客观题一律由服务端确定性判分，口径随笔试冻结在 `policy` 里（`POLICY_VERSION = quiz-policy-v1`），调整口径必须新增版本号。
- 客观题口径：单选 / 判断要求所选集合与正确答案完全一致，否则 0 分；多选完全一致得满分，所选是无错选的正确子集（且非空）得半分（`points // 2`，向下取整），出现任一错选或未选得 0 分。
- 开放题：走模型按 `correctness` / `depth` / `rigor` / `fit` 四维评分，只采纳逐字引用作答原文的证据（去掉空白与引号、句末标点后做包含比对，短于 8 字不算证据），无证据的维度记 `score=null`；按有效维度平均分折算题目分值（`OPEN_POINTS = 20`，作答至少 10 字）。
- 代码题：只做静态评审（`correctness` / `readability` 两维），**不执行任何用户代码**，`executed` 恒为 `false`；模型判分失败时整条作答不落库，避免「有作答、无结果」的中间态。
- 来源与版本随题目下发（`source.kind` 为 `seed` 或 `bank`，带 `label` 与 `version`）。

**当前边界**：客观题与代码题只从模块内置示范题（`app/modules/quiz/seed.py`）抽取，开放题优先取岗位题库、题库为空时回落到示范题；笔试尚无按学习目标自适应抽题，也没有跨次笔试的成绩趋势视图。

### 数据聚合与练习计划（已实现）

| 方法与路径 | 语义 |
| --- | --- |
| `GET /interview/growth` | 按 `role` + `rubric_version` 聚合真实场次的四维分数序列与平均值；可选 `role` 过滤 |
| `GET /interview/comparison?a=&b=` | 两次场次的口径校验：同岗位且同量表时 `connectable=true`，否则 `false` 并给出 `reason` / `same_role` / `same_rubric_version` |
| `GET /interview/practice-items` | 按岗位列练习项（可选 `role`），每条绑定 `source_report_id` 与 `source_session_id` |
| `POST /interview/practice-items` | 把某份报告的薄弱维度落成练习项；`dimension` 省略时落全部薄弱维度 |
| `PATCH|DELETE /interview/practice-items/{item_id}` | 改目标 / 状态、删除练习项 |
| `POST /interview/practice-items/{item_id}/retest` | 为练习项发起复测：按源场次口径生成新一场面试，并回写 `retest_session_id` |
| `POST /interview/sessions/{session_id}/regenerate` | 未作答场次重新生成题目（可选 `difficulty` / `kinds` 覆盖建场冻结值）；已有作答或已结束一律 409，不清空已有记录，也不改写此前场次的题目快照 |
| `GET /interview/insights?resumeVersionId=&jdId=` | 用真实简历与 JD 内容给出匹配点 / 风险点 / 岗位范围关键词 |

- 数据模型 `practice_items`：`role`、`dimension`、`goal`、`material`、`status`（`active` / `done`）、`source_report_id`、`source_session_id`、`rubric_version`、`retest_session_id`；练习项保留与原评估的关联（US-14.9）。
- 口径约束：`rubric_version` 是唯一的可比性边界——版本变化即口径变化，`/interview/comparison` 对不同岗位或不同量表的两次练习只并列展示、不连线；成长曲线只连接同 `role` + 同 `rubric_version` 的点，没有报告的场次不计入趋势（US-14.5）。
- 前端计数按来源报告对齐：「已加入 n / total」的分子只数 `source_report_id` 等于当前评估的练习项，更早评估留下的练习项单独成组并标注来源场次，避免出现「2 / 0」这种混口径计数；某份报告确实没有薄弱维度时就如实显示 0。

**当前边界**：复测结果回写 `retest_session_id`，前后变化靠成长曲线与历史对比间接体现，暂无独立的「复测前后同维度差值」视图；成长曲线的点位按场次顺序排列，不按时间窗滑窗聚合。

### 评分一致性抽检（已实现，结论：不通过）

- 入口：`backend/scripts/audit_rubric_consistency.py`（对同一 `rubric_version` 的场次做分层随机抽样，用同一评分 prompt 指纹复评）；判定口径与复跑步骤写在 [评分一致性抽检流程](evaluation/rubric-consistency-procedure.md)，最近一次留档在 `docs/evaluation/rubric-consistency-2026-10-09.{md,json}`。
- 判定口径：四维合并平均绝对偏差 ≤ 5.0 **且** 单点最大偏差 ≤ 10，可比较维度覆盖率 ≥ 0.8；两个条件必须同时满足才算通过，任一条不达标即判不通过。
- 2026-10-09 实测（样本 5 场 / 20 个维度，复评模型 deepseek-flash，seed 20261009）：四维合并 MAD **3.45**、单点最大偏差 **14**、±5 分内一致率 **90%**；分维度是 correctness 4.20 / 最大 14、depth 3.80 / 5、rigor 4.40 / 9、fit 1.40 / 3。
- 结论：**不通过**。两个条件分开看：**可比较维度覆盖率 100% 达标**（留档 `summary.coverage = 1.0`，门槛 0.8），**不通过的唯一原因是单点最大偏差 14 分超过 ≤ 10 的上限**，越界点来自一份作答数最少的场次；不粉饰也不重跑掩盖，按口径如实记录。
- 含义：当前量表分数只适合做相对趋势参考，不能当作可复现的绝对分；要改口径必须新增 `rubric_version`，并把复评差异一起留档。

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
- 同一批门禁由 `.githooks/pre-commit` 在每次提交前自动执行（`node quality-gates/run.js`，约 0.3s）：门禁不通过即拦截提交，紧急绕过用 `git commit --no-verify` 并说明原因。钩子走仓库自带 runner 而非 `archkit inspect .`，避免把「archkit 升级后 `.gate-version` 未 `--sync`」变成提交阻塞。
- 仓库是公开仓库：Git 跟踪的文本文件不得出现本机绝对路径（`/Users/<用户名>/`、`C:\Users\<用户名>\`、`/opt/homebrew/`）、个人邮箱域（gmail / 163 / qq / outlook 等）与内网 IP（`10.`、`172.16-31.`、`192.168.`），由 `quality-gates/gates/repo-privacy.js` 强制；改写为描述性写法或 `<本机用户名>` / `<接收方邮箱>` / `<内网地址>` 这类占位符，确属规则说明的行加 `privacy-allow` 标记。
- 表单与错误文案在客户端收口：含命名字段的表单必须接入 `useForm` + `zodResolver`，API 错误必须把机器错误码映射为 i18n 文案，不得直出服务端 `message`；由 `quality-gates/gates/ui-form-contract.js` 强制，遗留站点用行内 `form-allow` / `error-message-allow` 豁免标记登记。
- 前端界面文案由 i18next 管理，支持 `zh-CN` 与 `en`：语言选择持久化在 `localStorage`，启动时按「持久化 → 浏览器 → zh-CN」检测，切换同步 `html[lang]` 与文档标题；组件统一使用 `useTranslation()`，非 React 模块使用 `@/i18n` 单例。简历正文、JD 正文、事实内容与 Diff 原文属于用户内容，不随界面语言变化（US-13.4）。
- Agent 运行体采用**独立进程**形态，先以 CLI 落地（`agent-core` 提供可执行入口），后端后续 spawn 同一个入口；模型调用与 Agent 循环 **MUST NOT** 实现进后端（延续 C-09）。依据：独立进程强制运行体无状态（每一步都从持久化状态重建），且 CLI 是整个方案里不可逆性最低的形态——同一个入口将来既可被后端 spawn、也可被后端进程内调用、也可由用户自托管，业务逻辑无需改动。**例外（fb67d，已由用户拍板）**：`POST /jds:parse-text` 在 `app/modules/jd/parser.py` 内同步调用用户已配置的模型，是后端唯一的内联模型调用；依据是它只需一次短小、无工具、无状态的结构化请求，不写库、不碰简历，为它再 spawn 一个受监督 run 只会放大延迟与故障面。该路径复用 settings 的 endpoint 解析、超时预算与状态码文案，日志与错误响应不含 api key、Authorization 头与上游响应体。
- Agent 循环采用**步进式**：`/step` 从持久化状态出发推进到下一个断点（需要人类审批、预算耗尽或结束），并**每轮模型调用后落 checkpoint**（上下文消息与 RunBudget 计数）。依据：任何一步失败最多重跑一轮；断点即暂停且状态落库，人类动作后再续跑；用户关闭页面不影响推进。
- 会话层采用 **session + message** 命名与模型（对照 pi 的 session 树：entry 为树节点、message 只是其中一种 entry），**不采用 conversation + message**；存储抽成接口，首个实现落在库内。现状不一致需登记：`resume_versions.conversation_id` 与 `agent_run_id` 两列已存在但恒为空（`docs/agent/agent-operation-api.md` 自述「本期留空」），且不存在 `conversations` / `messages` 实体，因此契约中「切换 active_resume_id 先结算该会话上一轮」目前只能以「该简历的未关闭轮次」近似表达。
- 模型密钥（provider / endpoint / model / apiKey）**保留在后端加密存储**（`user_settings.model_config`，Fernet 加密、只写不回显），由后端按 run 临时交给运行体使用、用完即弃；运行体 **MUST NOT** 自持长期密钥，否则设置页的模型配置将失去意义。
- 审批的「人类在场」证明**维持现状**：`require_human_session` 以 `auth_kind != "pat"` 判定，即「持有有效会话 cookie 即视为人类」；本阶段**MUST NOT** 引入重输密码或后端二次确认签名。已知边界：cookie 可被扩展、脚本或同站 XSS 持有（叠加 `TurnSession.execute_patch` 在 approval 模式下自动 approve，等价于一次调用完成提案与批准）；缓解因素是 `SameSite=lax` 阻挡跨站 POST，且全仓暂无 CSRF 防护。**IF** 将来部署到公网、支持多用户且存在 XSS 面（UGC 渲染 / Markdown / 外链 / 富文本）-> **MUST** 增加 CSRF token 与显式 UI 动作来源标记；此触发条件记录于此，避免后续误判为遗漏。
- A11 面试闭环以「快照 + 冻结量表 + 程序化核对证据」为口径：会话创建即冻结简历版本与 JD 快照（`context_snapshot`），量表版本 `rubric_version`（当前 `interview-rubric-v1`）随会话与报告存储，调整评分口径必须新增版本号、不能原地改语义；报告四个内容维度顺序固定，模型给出的证据必须逐字核对为作答原话，核对不通过的维度记 `score=null` 而不是 0，可核对证据为空则整体报错，而不是给一份没有依据的报告。
- A11 面试的写入幂等与关闭语义沿用既有约定：作答按 `(question_id, idempotency_key)` 唯一、缺省键由服务端派生，场次结束后写入返回 409 `RUN_STATE_CONFLICT`，`finish` 幂等返回同一份报告；追问是增强项，模型失败只丢追问、不丢已落库的作答。
- 岗位题库与面试能力都不新增权限码：题库读写复用 `resume:read` / `resume:write`，面试读写复用 `jd:read` / `jd:write`，避免为 A11 改动 `app/modules/auth/rbac.py` 的权限目录。
- 题库去重口径（去掉全部空白后取 sha256）在生成脚本与导入接口之间共用，保证同一题干无论来自脚本还是导入都不会重复入库；`knowledge_refs` 为空表示没有依据，任何生成路径都不得伪造知识库引用。
- A11 的语音作答、知识库检索、笔试与数据聚合均已落地，接口与口径见「[A11 面试与能力提升](#a11-面试与能力提升)」；各节仍保留各自的「当前边界」，登记尚未冻结或已量到但暂不处理的细节，落地后回填，不把计划写成现状。
- A11 检索排序（已修，实测复验）：标题字段与小节标题字段现在分别按 `TITLE_FIELD_WEIGHT = 0.1`、`HEADING_FIELD_WEIGHT = 1.4` 加权，标签字段另有 `LABEL_BONUS_CAP = 2.2` 的加成上限且不做长度归一（`LABEL_FIELD_B = 0`）。取值依据：标题是人工凝练的主题标签，两个权重是在「35 篇语料 × 200 题」上网格搜索得到的，目标是「修正 6 道错配题中的 5 道、相对无加权基线无已知回退、回填覆盖率仍 200/200」；小节标题权重高于文档标题，是因为文档标题覆盖面大（一篇文档常覆盖十几个考点），小节标题通常直接对应一个问题；短标签不做长度归一，否则短标题会被长度惩罚，而加成封顶是为了防止长标题里的 bigram 盖过正文。这次**只改排序不改召回**：覆盖率过滤仍用组合文本词集合，所以改前改后 `--coverage` 都是 200/200。实测 q=Redis 的 top1 已是 `Redis 集群模式与大促限流治理 · 分层限流与本地兜底`，原「长切片词频压过标题命中」的边界消除；语料继续扩充后必须复测并回填本节。
- A11 长查询覆盖率（实测边界）：短查询（≤ 6 个查询词）按精确查找要求覆盖率 ≥ 0.7，长自然语言问句沿用 0.05 的弱下限；后者只共享一两个通用 bigram 时仍可能产生弱尾命中。这是「宁可空引用也不伪造」与「题干回填召回」之间已经量过的取舍：统一提高下限会把 200 道题的引用回填打成 0/200，因此弱尾命中以登记边界处理，不靠继续收紧阈值。
- A11 页面按屏幕拆分、消除双实现：`/interview/:id` 由 `SessionScreen` / `VoiceScreen` / `InterviewReportScreen` 承担，页面壳 `ui/src/pages/interview-session.tsx` 从 758 行降到 223 行，页内重复的 `ReportPanel` / `VoiceAnswerEntry` / `QuestionCard` 实现已删除；页面壳只做编排与数据获取，屏幕组件各自拥有交互与状态。依据：同一份界面在页面与特性目录各写一遍，必然出现改一处漏一处。
- 简历编辑器对话区接入历史会话：`ui/src/components/resume-chat-panel.tsx` 提供「当前对话 / 历史会话」页签，切到历史会话后可以继续对话并写回同一 session。会话作用域的结论是：`agent_sessions` 只绑 owner，scope 是轮次属性；复用会话由 `POST /resumes/{id}/runs` 传既有 `sessionId` 完成，不新建会话。
- 评分一致性抽检作为口径守卫：量表相关改动必须先跑 `backend/scripts/audit_rubric_consistency.py` 并按 [评分一致性抽检流程](evaluation/rubric-consistency-procedure.md) 判定；2026-10-09 的留档结论是不通过（覆盖率 100% 达标；不通过原因是单点最大偏差 14 分 > 10，MAD 3.45、±5 内 90%），因此当前分数只能作为相对趋势，报告与聚合页面不得把它描述成可复现的绝对分。
- A11 知识覆盖缺口靠语料解决：检索判定 no_match 就是没有依据，不允许放宽阈值或让模型补写引用；`@RefreshScope` 这类细分考点缺失时，处理方式是在 `kb/corpus/` 补对应主题的种子语料后重跑回填，而不是调低命中门槛。
