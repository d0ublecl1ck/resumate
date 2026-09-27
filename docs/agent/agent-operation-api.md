# Agent 操作 API 契约 v1（P0）

> 状态：**冻结**。三条并行工作流（backend API、agent-core 底座、API 操作 Skill）以本文为唯一接口基线。
> 工单：58d30。上游契约：docs/user-stories/contracts.md（C-01 / C-03 / C-04 / C-06 / C-09 / C-10）。
> 先改本文，再改实现；实现不得单方面偏离。

## 1. 目标与范围

P0 让外部 Agent 通过公共 REST API 完成一次最小闭环：创建轮次 → 提案 Patch → 预览 → 审批 → 应用到 Working Copy → finalize 产生可追溯版本（或 cancel）。

包含：

1. **UserTurn**：创建、读取、finalize、cancel。
2. **Working Copy**：按轮次暂存，finalize 时聚合为一个 ResumeVersion。
3. **领域 Patch**：validate、preview、apply。
4. **PendingAction**：approve、reject。
5. **服务端固化执行模式**（approval / full_access）。
6. **能力发现**补充 agent.* 能力。

不包含（后续工单）：PAT Bearer 鉴权与 Scope 强制、MCP Server、TS/Python SDK、Webhook、manual-edits、SSE 流式事件、Profile 选材生成。

## 2. 传输约定

- 请求与响应 JSON 一律 camelCase；后端 Pydantic 用 snake_case 字段 + ApiModel 别名。
- 鉴权沿用现有 HttpOnly 会话 Cookie（本期不引入 Bearer）。
- 业务失败统一返回错误信封 **{ code, message, latestVersionId? }**。
- 资源标识前缀：**turn_**、**pa_**（PendingAction）、**res_**、**ver_**。

## 3. 执行模式固化（C-02）

创建轮次时按顺序解析并**固化**到该轮次，之后不随设置变化：

1. 请求体显式 **executionMode** → **modeSource = "session"**。
2. 否则账户 Agent 配置已显式保存 **nextRunMode** → **modeSource = "agent"**。
3. 否则账户默认 → **modeSource = "account"**，值 **approval**。

approval 的普通内容 Patch 必须经过 PendingAction 才能 apply；full_access 的普通内容 Patch 可直接 apply。两种模式都必须校验身份、所有权、Patch Schema 与 baseVersionId。

## 4. 资源模型

### 4.1 UserTurn（UserTurnResponse）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 稳定 **user_turn_id**（turn_ 前缀） |
| resumeId | string | 目标简历 |
| clientId | string | 调用方标识，默认 "external" |
| source | "agent" \| "manual" \| "client" | 缺省 "agent"；服务端不信任伪造值 |
| executionMode | "approval" \| "full_access" | 固化模式 |
| modeSource | "session" \| "agent" \| "account" | 模式来源 |
| state | "open" \| "finalized" \| "cancelled" | 轮次状态 |
| baseVersionId | string \| null | 轮次开始时的正式版本 |
| message | string | 轮次说明 |
| createdAt | datetime | |
| closedAt | datetime \| null | |
| result | TurnResult \| null | 关闭后结果 |
| pendingActions | PendingActionResponse[] | 该轮次待办投影 |

TurnResult：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| state | "finalized" \| "cancelled" | |
| resumeId | string | |
| versionId | string \| null | 无内容变化时为 null，不创建空版本（C-03） |
| changeCount | int | |
| affectedSections | string[] | |
| message | string | |
| idempotentReplay | bool | 是否命中幂等重放 |

### 4.2 WorkingDocumentResponse

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| resumeId | string | |
| document | ResumeDocument | 当前 Working Copy（无暂存时返回正式 document） |
| baseVersionId | string \| null | Working Copy 基于的正式版本 |
| userTurnId | string \| null | 占有 Working Copy 的轮次 |
| workingRevision | int | 暂存修订号，每次成功 apply +1 |
| dirty | bool | Working Copy 是否不同于正式 document |

### 4.3 PendingActionResponse

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | pa_ 前缀 |
| userTurnId | string | 所属轮次 |
| kind | "content_patch" | 本期仅内容 Patch |
| title | string | 展示标题 |
| targetResource | string | resumeId |
| baseVersionId | string \| null | |
| impactSummary | string | 影响摘要 |
| requiresTextConfirm | bool | 本期统一 false |
| state | "pending" \| "approved" \| "rejected" \| "consumed" \| "stale" | |
| staleReason | string \| null | |
| diff | DiffItem[] | 与 UI DiffItem 对齐 |
| createdAt | datetime | |
| decidedAt | datetime \| null | |

DiffItem：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 稳定 diff id |
| target | string | 人读定位，如 "经历 · 高级前端工程师" |
| changeType | "added" \| "removed" \| "modified" | |
| before | string \| null | |
| after | string \| null | |
| reason | string | 来自 Patch.reason |
| state | "pending" \| "accepted" \| "rejected" | |

## 5. Patch 语言（领域 Patch，非 RFC 6902）

PatchRequest：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| ops | PatchOp[] | 至少 1 条 |
| reason | string | 默认 "" |
| baseVersionId | string \| null | 与轮次基线不一致时返回 BASE_VERSION_STALE |

PatchOp 为判别联合，op 取值：

1. **setBasics**：字段 **basics**（完整 ResumeBasics）→ 整体替换 basics。
2. **upsertSection**：字段 **section**（完整 ResumeSection）→ 按 section.id 插入或整体替换。
3. **removeSection**：字段 **sectionId** → 删除；不存在返回 SECTION_NOT_FOUND。
4. **upsertEntry**：字段 **sectionId**、**entry**（完整 ResumeEntry）→ 按 entry.id 插入或替换；section 不存在返回 SECTION_NOT_FOUND。
5. **removeEntry**：字段 **sectionId**、**entryId** → 删除；section 或 entry 不存在返回对应 NOT_FOUND。

Patch 按数组顺序应用；任一条失败则整组不生效（validate 返回全部可判定错误）。应用对象是 Working Copy 候选文档，不直接改正式 document。

## 6. 端点

所有端点分别声明唯一权限：读 **resume:read**，写 **resume:write**。

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | /resumes/{resume_id}/turns | resume:write | 创建轮次；若有未关闭轮次，先按 C-04 finalize 旧轮 |
| GET | /turns/{turn_id} | resume:read | 读取轮次与待办 |
| POST | /turns/{turn_id}/finalize | resume:write | 聚合提交并关闭；幂等 |
| POST | /turns/{turn_id}/cancel | resume:write | 失效未决待办、按 C-04 结算已应用修改并关闭 |
| POST | /turns/{turn_id}/patches:validate | resume:write | 只校验，无副作用 |
| POST | /turns/{turn_id}/patches:preview | resume:write | 计算 Diff；approval 创建 pending PendingAction |
| POST | /turns/{turn_id}/patches:apply | resume:write | 写入 Working Copy；approval 需已 approved 的 pendingActionId |
| GET | /turns/{turn_id}/pending-actions | resume:read | 列出轮次待办 |
| GET | /resumes/{resume_id}/working-document | resume:read | 读取 Working Copy 状态 |
| POST | /pending-actions/{action_id}/approve | resume:write | pending → approved |
| POST | /pending-actions/{action_id}/reject | resume:write | pending → rejected |

请求/响应体：

- **POST /resumes/{resume_id}/turns**：body **{ baseVersionId?, executionMode?, clientId?, source?, message? }** → 201 UserTurnResponse。
- **POST /turns/{turn_id}/finalize**：body **{ idempotencyKey?, message? }** → UserTurnResponse（result 非空）。
- **POST /turns/{turn_id}/cancel**：body **{ idempotencyKey?, reason? }** → UserTurnResponse。
- **patches:validate**：body PatchRequest → PatchValidationResponse **{ valid, errors: [{ opIndex, code, message }] }**。
- **patches:preview**：body PatchRequest → PatchPreviewResponse **{ valid, resumeId, baseVersionId, changeCount, affectedSections, diff, pendingActionId, requiresConfirmation }**。
- **patches:apply**：body **{ ops, reason?, baseVersionId?, pendingActionId?, idempotencyKey? }** → PatchApplyResponse **{ applied, userTurnId, resumeId, changeCount, affectedSections, workingRevision, pendingActionId, idempotentReplay }**。
- **working-document**：GET → WorkingDocumentResponse。
- **approve / reject**：body **{}** 可选 → PendingActionResponse。

## 7. 状态机

UserTurn：**open → finalized**（finalize）、**open → cancelled**（cancel）。对已关闭轮次的写请求返回 **TURN_ALREADY_CLOSED**；读取仍可用。

PendingAction：**pending → approved → consumed**（apply 消费）、**pending → rejected**、**pending → stale**（基线或负载变化使确认失效）。已非 pending 的 approve/reject 返回 VALIDATION_FAILED。

Working Copy：首个 apply 时以轮次 baseVersionId 从正式 document 派生；finalize 成功后清空；cancel 时若有已应用修改则按 C-04 结算后清空。

## 8. 幂等与并发（C-06）

- finalize/cancel/apply 接受 **idempotencyKey**。同一轮次 + 操作类型 + 相同 key + 相同负载 → 返回原结果并把 **idempotentReplay=true**；相同 key 不同负载 → 409 IDEMPOTENCY_CONFLICT。
- apply 前校验轮次 **baseVersionId** 是否等于简历当前 current_version_id；不一致返回 409 BASE_VERSION_STALE，latestVersionId = 最新版本。
- finalize 原子提交聚合 Patch + Snapshot + Version + current_version_id；无内容差异不创建版本（C-03）。
- 同轮次多份 Resume：本期轮次绑定单份 Resume，每轮每份最多一个版本。

## 9. 信任边界（本期限制，必须写进 README/工单）

PAT Bearer 鉴权与 Scope 强制不在本期，所有端点使用会话身份 + RBAC。**source、executionMode 由服务端解析**，客户端不能凭参数字段绕过确认：approval 下没有已 approved 的 PendingAction 就不可能 apply。PAT 接入后必须复用同一服务端解析路径。

## 10. 后端实现职责（backend/）

新增模块 **app/modules/agent/**：**api.py**（仅传输）、**schemas.py**、**service.py**（业务规则）、**dao.py**、**models.py**。

- models：**AgentTurn**（agent_turns）、**PendingAction**（agent_pending_actions）、**AgentOperation**（agent_operations，幂等结果）。
- resume 模块新增 Working Copy 列：**working_document**、**working_base_version_id**、**working_turn_id**、**working_revision**，并提供 staging/commit/clear 服务函数；agent.service 调用它们，resume 不反向依赖 agent。
- errors.py 新增：TURN_NOT_OPEN、PENDING_ACTION_NOT_APPROVED、PENDING_ACTION_STALE、IDEMPOTENCY_CONFLICT（均 409）。
- main.py 显式注册 agent router；migrations/env.py 导入 agent models；新增一个 Alembic 迁移（down_revision = d1e5f9a3b7c2）。
- access 能力发现追加 "agent.turns"、"agent.patches"、"agent.pending_actions"。
- 测试覆盖：轮次幂等 finalize、TURN_ALREADY_CLOSED、approval 先审后 apply、full_access 直写、BASE_VERSION_STALE、cancel 结算、working-document。

## 11. agent-core 底座职责（agent-core/）

Python 包（uv），通过公共 API 工作，**不得直连数据库**（C-09）。目录：

~~~text
agent-core/
  pyproject.toml
  README.md
  src/resumate_agent_core/
    __init__.py
    config.py      # base_url / token / timeout
    errors.py      # API 错误信封 → 异常
    models.py      # 与第 4/5 节一致的 Pydantic 模型
    patches.py     # PatchOp 构造器
    client.py      # 公共 API 薄客户端
    turn.py        # TurnSession：begin/apply/finalize/cancel 上下文
    tools.py       # 工具表：名称 → schema + client 调用
    runtime.py     # C-09 循环骨架：上下文 → 模型 → 工具 → 结果，含预算/取消
    skills.py      # 加载 skills/ 下的 SKILL.md
  skills/resumate-api-operations/SKILL.md
  tests/
~~~

约束：httpx 作为唯一 HTTP 依赖；ModelProvider 以 Protocol 注入，不绑定具体模型厂商；runtime 只编排、不持久化业务状态。

## 12. API 操作 Skill 职责

**agent-core/skills/resumate-api-operations/SKILL.md** 面向 Hermes / Codex / 通用 Agent，必须包含：能力发现与鉴权、执行模式、最小闭环步骤（含 approval 与 full_access 两条路径）、每个端点的工具/参数/确认/轮次步骤、错误码处理、幂等键约定，以及一个可复制的端到端示例。

## 13. PAT Bearer 鉴权与 Scope（并入）

> 本节由原 docs/agent/pat-auth.md 并入，作为唯一契约基线。

### 13.1 认证路径

- 请求带 **Authorization: Bearer rsm_pat_...** → PAT 身份；否则走 HttpOnly 会话 Cookie；二者同时存在时 Bearer 优先。

### 13.2 校验顺序

1. Bearer 明文 SHA-256 后查 personal_access_tokens.token_hash。
2. 未命中 → 401 UNAUTHENTICATED。
3. revoked_at 非空 → 401 TOKEN_REVOKED。
4. expires_at 已过 → 401 UNAUTHENTICATED。
5. 加载 owner 与 RBAC 投影；被封禁 → 403 ACCOUNT_BANNED。
6. 端点权限码不在 PAT scopes → 403 SCOPE_INSUFFICIENT。
7. 通过 → 更新 last_used_at，写一条 allowed access_logs。
8. 任一拒绝 → 写一条 denied access_logs（error_code 为机器码）。

审计条数：认证成功先写 allowed；若随后因 scope 被拒再写 denied。即 scope 拒绝的请求共两行（allowed + denied），保留更完整信息。

### 13.3 Scope 与权限

- 允许的 scope 集合为 access/service.py 的 ALLOWED_SCOPES；端点权限码与 scope 同名，按集合成员判断。
- 非 scopable 权限（access:write、user:read、role:write 等）PAT 一律 SCOPE_INSUFFICIENT。

### 13.4 身份、client_id 与信任边界

- CurrentUser 含 auth_kind（session | pat）、pat_id、scopes。
- **PAT 请求的 client_id 由服务端固化**：忽略请求体 clientId，使用 PAT 的 name（回退 pat_id）。会话请求仍可使用请求体 clientId。
- PAT 请求的 source 按 agent 处理；**executionMode 入参被忽略**，模式只从 agent 配置 / 账户默认解析。
- 不得回传令牌明文或哈希。

## 14. 版本记录溯源（C-03）

- resume_versions 增加 5 个可空列：client_id、conversation_id、user_turn_id、agent_run_id、execution_mode。
- ResumeVersionResponse 暴露上述字段（camelCase，可空）。
- Agent finalize 提交时写入 client_id（turn.client_id）、user_turn_id（turn.id）、execution_mode（turn.execution_mode）；conversation_id / agent_run_id 本期留空。
- 手动 PUT document 提交时 user_turn_id / execution_mode 留空。
- 迁移在现有 head 之后新增一版，5 列均可空。

## 15. 基线推进时的重排与队列（C-04 / C-06）

触发：preview / apply / finalize / cancel 时 turn.base_version_id != resume.current_version_id（用户手动提交把基线推进了）。

规则：

1. 若该轮没有暂存改动（working_turn_id != turn.id）→ 仅把 turn.base_version_id 刷新为当前版本后继续，不报错。
2. 若有暂存改动 → 三方重排：old_base = turn.base_version_id 对应版本快照（无则空文档），staged = Resume.working_document，new_base = Resume.document；把 old_base → staged 的增量重新应用到 new_base 之上。
3. 逐作用域判定：
   - basics：双方都改 → 冲突；仅 agent 改 → 取 agent；否则取 new_base。
   - 章节按 id：agent 新增且 new_base 已有同 id → 冲突；agent 删除且 new_base 仍在 → 删除；agent 修改且 new_base 同章节也改了 → 冲突；否则取 agent 版本。
   - 条目按 id 同规则。
4. 无冲突 → 写回暂存文档，把 Resume.working_base_version_id 与 turn.base_version_id 更新为当前版本，working_revision 递增；响应标记 baseRebased=true。approval 下原有已批准待办因 Diff 变化置 stale，需重新 preview + approve。
5. 有冲突 → **不得丢弃暂存**：保留暂存文档（排队待处理），返回 409 REBASE_CONFLICT（latestVersionId = 当前版本），并暂停该轮新的写执行（C-02）。Agent 可读取 working-document 后重新提案。
6. cancel 同样先重排；无冲突则按 C-04 结算已应用改动后关闭，不再丢弃。

新增机器错误码 REBASE_CONFLICT（409）。

## 16. 审计落点（C-10）

- Agent 写操作的审计事实源为「版本 + 轮次」记录：ResumeVersion 经第 14 节补齐 client_id / user_turn_id / execution_mode 后，可从版本追到轮次、客户端与模式；Turn 记录 finalize / cancel 与结果。
- access_logs 只承载鉴权语义（PAT 认证允许 / 拒绝、Scope 拒绝），不承载业务操作审计。
- 不新增独立业务审计表。

## 17. 模型目录与配置 API（9546b）

**GET /models/catalog**（权限 settings:read）→ ModelCatalogResponse：

- source：字符串，固定 "litellm"。
- providers：数组，元素为 { id, label, models }；models 元素为 { id, label, contextWindow?, maxOutputTokens?, inputCostPerMillion?, outputCostPerMillion? }。
- 可选查询参数：provider（按 provider id 过滤）、q（按模型 id / 名称搜索）。
- 数据直接来自 litellm 目录，仓库不自维护任何模型清单。

**GET | PUT /models/config**（settings:read / settings:write）形状不变：provider、endpoint、model 均可选，apiKey write-only、只返回 keyConfigured。

**POST /models/config:test**（settings:write）用 litellm 做连通性测试；响应与错误均不含明文密钥。

前端：模型设置表单的 provider / model 来自 catalog，使用既有开源组件（@base-ui/react 等），文案走 i18n 双语。

