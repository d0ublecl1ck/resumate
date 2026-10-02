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

不包含（后续工单）：MCP Server、TS/Python SDK、Webhook、manual-edits、SSE 流式事件、Profile 选材生成（PAT Bearer 鉴权与 Scope 强制已并入 §13）。

## 2. 传输约定

- 请求与响应 JSON 一律 camelCase；后端 Pydantic 用 snake_case 字段 + ApiModel 别名。
- 鉴权支持 HttpOnly 会话 Cookie 与 `Authorization: Bearer rsm_pat_...`（PAT）两条路径，Bearer 优先；见 §13。
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

所有端点分别声明唯一权限：读 **resume:read**，写 **resume:write**。approve / reject 另要求人类会话：PAT / agent 来源一律 403 **FORBIDDEN**（见 §9）。会话层与 run checkpoint 的端点见 §19。

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | /resumes/{resume_id}/turns | resume:write | 创建轮次；若有未关闭轮次，先按 C-04 finalize 旧轮 |
| GET | /resumes/{resume_id}/turns | resume:read | 列出该简历的轮次；`state` 可选（open\|finalized\|cancelled），创建时间倒序，最多 100 条 |
| POST | /resumes/{resume_id}/runs | resume:write + 人类会话 | spawn 运行体（第 20 节）；未配置模型 409 MODEL_NOT_CONFIGURED |
| GET | /agent/runtime | resume:read | 运行体就绪探测（第 20.5 节）：`available` 表示后端能在需要时启动运行体，不是常驻进程 |
| POST | /turns | resume:write | 通用建轮次（第 21.2 节）：`scope=resume` 需 `resumeId`，`scope=profile` 需 `sessionId` |
| POST | /sessions/{session_id}/runs | resume:write + 人类会话 | profile 作用域 run（第 21.3 节）；PAT / run 凭据 403 |
| GET | /turns/{turn_id} | resume:read | 读取轮次与待办 |
| POST | /turns/{turn_id}/finalize | resume:write | 聚合提交并关闭；幂等 |
| POST | /turns/{turn_id}/cancel | resume:write | 失效未决待办、按 C-04 结算已应用修改并关闭 |
| POST | /turns/{turn_id}/patches:validate | resume:write | 只校验，无副作用 |
| POST | /turns/{turn_id}/patches:preview | resume:write | 计算 Diff；approval 创建 pending PendingAction |
| POST | /turns/{turn_id}/patches:apply | resume:write | 写入 Working Copy；approval 需已 approved 的 pendingActionId |
| GET | /turns/{turn_id}/pending-actions | resume:read | 列出轮次待办 |
| GET | /resumes/{resume_id}/working-document | resume:read | 读取 Working Copy 状态 |
| GET | /turns/{turn_id}/events | resume:read | 轮次状态 SSE 订阅（第 18 节） |
| POST | /pending-actions/{action_id}/approve | resume:write + 人类会话 | pending → approved；PAT 403 FORBIDDEN |
| POST | /pending-actions/{action_id}/reject | resume:write + 人类会话 | pending → rejected；PAT 403 FORBIDDEN |

请求/响应体：

- **POST /resumes/{resume_id}/turns**：body **{ baseVersionId?, executionMode?, clientId?, source?, message? }** → 201 UserTurnResponse。
- **POST /turns/{turn_id}/finalize**：body **{ idempotencyKey?, message? }** → UserTurnResponse（result 非空）。
- **POST /turns/{turn_id}/cancel**：body **{ idempotencyKey?, reason? }** → UserTurnResponse。
- **patches:validate**：body PatchRequest → PatchValidationResponse **{ valid, errors: [{ opIndex, code, message }] }**。
- **patches:preview**：body PatchRequest → PatchPreviewResponse **{ valid, resumeId, baseVersionId, changeCount, affectedSections, diff, pendingActionId, requiresConfirmation }**。
- **patches:apply**：body **{ ops, reason?, baseVersionId?, pendingActionId?, idempotencyKey? }** → PatchApplyResponse **{ applied, userTurnId, resumeId, changeCount, affectedSections, workingRevision, pendingActionId, idempotentReplay }**。
- **working-document**：GET → WorkingDocumentResponse。
- **approve / reject**：body **{}** 可选 → PendingActionResponse。

**GET /resumes/{resume_id}/turns**：可选查询参数 **state**（`open` / `finalized` / `cancelled`）过滤；按 `createdAt` 倒序返回 UserTurnResponse[]（含 pendingActions），最多 100 条。简历不存在或不属于当前用户 → 404 RESOURCE_NOT_FOUND；没有任何匹配轮次 → `[]`（不是 404）。轮次发现**不得依赖 Working Copy**：approval 模式下 preview 只创建 PendingAction、不 stage，`working-document.userTurnId` 在首次 apply 之前为空；前端 `getActiveRun` 因此改用本端点发现「已有待办、尚未 apply」的活跃轮次。

## 7. 状态机

UserTurn：**open → finalized**（finalize）、**open → cancelled**（cancel）。对已关闭轮次的写请求返回 **TURN_ALREADY_CLOSED**；读取仍可用。

PendingAction：**pending → approved → consumed**（apply 消费）、**pending → rejected**、**pending → stale**（基线或负载变化使确认失效）。已非 pending 的 approve/reject 返回 VALIDATION_FAILED。

Working Copy：首个 apply 时以轮次 baseVersionId 从正式 document 派生；finalize 成功后清空；cancel 时若有已应用修改则按 C-04 结算后清空。

## 8. 幂等与并发（C-06）

- finalize/cancel/apply 接受 **idempotencyKey**。同一轮次 + 操作类型 + 相同 key + 相同负载 → 返回原结果并把 **idempotentReplay=true**；相同 key 不同负载 → 409 IDEMPOTENCY_CONFLICT。
- apply 前校验轮次 **baseVersionId** 是否等于简历当前 current_version_id；不一致返回 409 BASE_VERSION_STALE，latestVersionId = 最新版本。
- finalize 原子提交聚合 Patch + Snapshot + Version + current_version_id；无内容差异不创建版本（C-03）。
- 同轮次多份 Resume：本期轮次绑定单份 Resume，每轮每份最多一个版本。

## 9. 信任边界

PAT Bearer 鉴权与 Scope 强制已实现并并入 §13，所有来源复用同一服务端解析路径，不存在 PAT 旁路。**source、executionMode 由服务端解析**，客户端不能凭参数字段绕过确认：approval 下没有已 approved 的 PendingAction 就不可能 apply。

**审批是人类动作。** approve / reject 只接受人类会话（HttpOnly Cookie）；PAT / agent 来源调用一律 403 `FORBIDDEN`，并按 PAT 审计约定写一条 `purpose=pat_human_session` 的 `denied`。Agent 可以建轮次、预览并读出待办，但必须由用户在自己的浏览器会话里批准或拒绝；`agent-core` 也不再向模型暴露 approve / reject 工具。

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

审批端点附加约束：`POST /pending-actions/{action_id}/approve|reject` 在 scope 通过后仍要求人类会话，PAT 来源 403 `FORBIDDEN` 并写一条 `purpose=pat_human_session` 的 denied，因此 PAT 无法自行批准自己的待办（§9）。

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

7. 逃逸路径：preview / apply / finalize 冲突时返回 409 且保留暂存（排队）。**cancel 与 begin 自动关闭旧轮是显式放弃路径**：遇冲突不再报错，而是关闭轮次并丢弃冲突暂存、记录原因，保证不会出现「无法关闭的轮次」或「无法开启新轮次」的死锁。

## 16. 审计落点（C-10）

- Agent 写操作的审计事实源为「版本 + 轮次」记录：ResumeVersion 经第 14 节补齐 client_id / user_turn_id / execution_mode 后，可从版本追到轮次、客户端与模式；Turn 记录 finalize / cancel 与结果。
- access_logs 只承载鉴权语义（PAT 认证允许 / 拒绝、Scope 拒绝、人类动作来源拒绝），不承载业务操作审计。
- 不新增独立业务审计表。

## 17. 模型目录与配置 API（9546b）

**GET /models/catalog**（权限 settings:read）→ ModelCatalogResponse：

- source：字符串，固定 "models.dev"。
- providers：数组，元素为 { id, label, models }；models 元素为 { id, label, contextWindow?, maxOutputTokens?, inputCostPerMillion?, outputCostPerMillion? }。
- 可选查询参数：provider（按 provider id 过滤）、q（按模型 id / 名称搜索）。
- 数据来自开源目录 models.dev 的快照：刷新脚本把上游 api.json 投影为本地快照（id / name / limit / cost）写入仓库，运行时读本地文件、离线可用；仓库不自维护 provider / model 清单。

**GET | PUT /models/config**（settings:read / settings:write）形状不变：provider、endpoint、model 均可选，apiKey write-only、只返回 keyConfigured。

**POST /models/config:test**（settings:write）用 httpx 调用 OpenAI 兼容的 /chat/completions 做连通性测试；响应与错误均不含明文密钥。provider 适配统一为 OpenAI 兼容实现（OpenAICompatibleProvider），非 OpenAI 兼容的原生协议暂不支持。

前端：模型设置表单的 provider / model 来自 catalog，使用既有开源组件（@base-ui/react 等），文案走 i18n 双语。


## 18. 轮次事件订阅（SSE，b75c6）

> 本节是 `ui/src/lib/api.ts:149` 那条「SSE 在真实实现中用 EventSource」注释的落地契约：
> 真实实现不返回一份 AgentRun 快照，而是订阅某个轮次的状态流。

### 18.1 端点

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | /turns/{turn_id}/events | resume:read | 订阅该轮次的 Server-Sent Events 流 |

- 路径挂在既有 `/turns/{turn_id}` 家族下（与 §6 其余端点一致），不另开 `/agent` 命名空间。
- 流建立前先解析轮次归属：未知或不属于当前用户的 turn 返回 404 `RESOURCE_NOT_FOUND`（正常 JSON 错误信封），不会先返回 200 再中途报错。
- 认证与会话 Cookie / PAT 一致（§13）：PAT 的 `resume:read` scope 即可订阅。本端点只读，不提供任何 approve/reject 能力，`require_human_session` 语义不受影响。

### 18.2 响应头与帧格式

- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`（禁用 nginx 反代缓冲）

帧字段：`id:`（每连接递增序号）、`event:`、`data:`（单行 JSON）；连接建立后先发 `retry: 3000`。
心跳是注释行 `: heartbeat`：EventSource 不会为它触发事件，仅用于保活并穿透代理。

### 18.3 事件类型

| event | 何时推送 | data |
| --- | --- | --- |
| snapshot | 每次建立连接的首帧 | 与 `GET /turns/{turn_id}` 完全同构的 UserTurnResponse |
| turn.updated | 轮次或其待办状态相对上一帧真的发生变化时 | 新的 UserTurnResponse 投影 |
| （注释）: heartbeat | 空闲超过心跳间隔 | 无（注释行） |

- 变化检测基于轮询持久化状态（`SSE_POLL_INTERVAL_SECONDS`，默认 1s），用规范化 JSON 比较；无变化不会重复推送 `snapshot` / `turn.updated`。
- 心跳间隔 `SSE_HEARTBEAT_INTERVAL_SECONDS`（默认 15s）。
- **没有假事件**：进度、token、步骤、run 状态这类事件需要 Agent run loop，本期未实现，因此一条都不推；等 run loop 落地后再新增。
- 断连语义：客户端断开时 Starlette 关闭生成器，`get_db` 依赖随后关闭请求会话（事务回滚、连接归还连接池）；轮次消失（删除或归属变化）时生成器也自行结束。

### 18.4 客户端

`ui/src/lib/turn-events.ts` 的 `subscribeTurnEvents(turnId, handlers)` 封装 `EventSource`（`withCredentials`），
解析 `snapshot` / `turn.updated` 并返回退订函数；重连交给 EventSource 自身（首帧 `retry`）。
注释心跳不会触发 EventSource 事件，所以没有 `onHeartbeat`：连接状态由 `onOpen` / `onError` 与数据帧到达体现。

### 18.5 代理层验证（可复现）

分别启动后端与前端，用带时间戳的 `curl -N --no-buffer` 观察帧是否分块即时到达：

```bash
# 1) 后端（短心跳便于观察）
DATABASE_URL=postgresql+psycopg://localhost:5432/resumate \
SSE_POLL_INTERVAL_SECONDS=0.2 SSE_HEARTBEAT_INTERVAL_SECONDS=2 \
uv run --directory backend uvicorn app.main:app --port 8011

# 2) 前端 dev server，代理指向该后端
cd ui && API_PROXY_TARGET=http://127.0.0.1:8011 pnpm dev --port 5174

# 3) 直连与经代理各订阅一次，逐行打印相对到达时间
TID=turn_xxx
curl -sS -N --no-buffer -b cookies.txt "http://127.0.0.1:8011/turns/$TID/events" \
  | python3 -u -c 'import sys,time; t=time.time()
for line in sys.stdin: print(f"{time.time()-t:7.3f}s {line.rstrip()}")'
curl -sS -N --no-buffer -b cookies.txt "http://127.0.0.1:5174/api/turns/$TID/events" \
  | python3 -u -c 'import sys,time; t=time.time()
for line in sys.stdin: print(f"{time.time()-t:7.3f}s {line.rstrip()}")'
```

实测（issue b75c6）：直连与经 Vite proxy 两条链路的 `snapshot` 都在 0.000s 到达，真实状态变化在亚秒级推出 `turn.updated`，空闲心跳按配置间隔持续到达，证明是分块流而不是一次性响应。
Vite 的 `/api` proxy（http-proxy）默认即流式，**无需**修改 `ui/vite.config.ts`。

## 19. 会话层与 run checkpoint（9d29a）

### 19.1 资源模型

| 实体 | 字段 | 说明 |
| --- | --- | --- |
| agent_sessions | id, owner_id, created_at, updated_at, last_active_at | 会话身份只绑 owner；**不含 resume_id**（一个会话可跨多份简历） |
| agent_session_messages | id, session_id, seq, role, content(JSON), created_at | role ∈ system\|user\|assistant\|tool；唯一约束 (session_id, seq) |
| agent_turns（扩展） | session_id(可空), run_state(JSON 默认 {}), state_version(int 默认 0) | 轮次挂会话；run_state 是该轮次的 checkpoint |

### 19.2 端点

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | /sessions | resume:write | 建会话；body 可省略 |
| GET | /sessions | resume:read | 当前用户的会话，最近活跃优先（last_active_at desc） |
| GET | /sessions/{session_id}/messages | resume:read | 列出消息；`afterSeq=N` 只返回 seq > N |
| POST | /sessions/{session_id}/messages | resume:write | 追加消息；同一 (session_id, seq) 幂等 |
| GET | /turns/{turn_id}/state | resume:read | 读 run checkpoint |
| PUT | /turns/{turn_id}/state | resume:write | 写 run checkpoint，stateVersion 乐观锁 |

- owner 隔离：未知或不属于当前用户的 session / turn 一律 404 `RESOURCE_NOT_FOUND`（在返回响应体之前判定，与 §18 一致，不会先 200 再报错）。
- `POST /resumes/{resume_id}/turns` 新增可选 `sessionId`：未知会话 404；挂载成功后刷新该会话的 `updated_at` / `last_active_at`。`UserTurnResponse` 回显 `sessionId`。
- 权限码沿用 `resume:read` / `resume:write`：这些端点只服务于 Agent 操作层，且这两个码可被 PAT scope 覆盖，不新增权限目录条目。

### 19.3 消息幂等

- `(session_id, seq)` 是消息身份：重复 POST 返回既有那条，不产生重复行；`seq` 由调用方分配，必须 >= 0。
- `GET .../messages` 默认返回全部；`afterSeq=N` 用于断线后的增量拉取。

### 19.4 run checkpoint 与乐观锁

- GET 返回 `{ turnId, runState, stateVersion }`；`runState` 是不透明 JSON，契约只约定客户端可写 `version` 字段（agent-core 写 `version: 1`）。
- PUT body `{ stateVersion, runState }`：`stateVersion` 必须等于服务端当前值，否则 409 `RUN_STATE_CONFLICT` 且**不写入**；成功后服务端 `stateVersion += 1` 并返回新值。
- 语义为「单写者 / 轮次」：agent-core 在每轮模型调用后写入消息上下文、budget 计数、turn_id、pending_action_id 与 phase，`--resume <turnId>` 据此恢复。

### 19.5 新错误码

| code | HTTP | 触发 | 恢复动作 |
| --- | --- | --- | --- |
| `RUN_STATE_CONFLICT` | 409 | PUT state 的 `stateVersion` 与服务端当前值不一致 | 重新 `GET /turns/{turn_id}/state`，基于新版本重写 |

## 20. 运行体 spawn（83c41）

运行体是**独立进程**：后端不实现模型调用，而是为一次 run spawn `resumate-agent` CLI，由它通过公共 API 创建轮次、落 checkpoint 并写简历。

### 20.1 端点

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | /resumes/{resume_id}/runs | resume:write + 人类会话 | 启动一次运行体进程，返回 202 |

- body：`{ prompt: string(1..8000), executionMode?: "approval" | "full_access", sessionId?: string }`。
- 成功：202 `{ runId, status: "started" }`；**不返回 turnId**——轮次由子进程创建，前端用 `GET /resumes/{id}/turns?state=open` 与 SSE 发现。
- 未知/越权简历 404；未知/越权会话 404；PAT / agent 来源 403 `FORBIDDEN`（运行体需要可委派的用户凭据，且 spawn 进程是用户动作）。
- 未配置模型密钥 409 `MODEL_NOT_CONFIGURED`（不 spawn，供界面引导）。
- 并发已满 429 `RATE_LIMITED`。

### 20.2 凭据

- 子进程环境变量：`RESUME_AGENT_CORE_BASE_URL`、`RESUME_AGENT_CORE_TOKEN`、`RESUME_AGENT_CORE_MODEL`、`RESUME_AGENT_CORE_API_KEY`，可选 `RESUME_AGENT_CORE_PROVIDER_BASE_URL`。apiKey 与 run 凭据**只走 env，不进 argv**（`ps` 不可见）。
- **不再注入会话 cookie**（8f5fe）。`RESUME_AGENT_CORE_TOKEN` 是一次一 run 的运行凭据：Bearer secret 前缀 `rsm_run_`，绑定 `(ownerId, resumeId, runId, expiresAt)`，Redis 只存 SHA-256；有效期 = `AGENT_RUNNER_TIMEOUT_SECONDS + AGENT_RUNNER_TOKEN_SLACK_SECONDS`，默认使用上限 `AGENT_RUNNER_TOKEN_MAX_USES=1000`（一次 run 会发很多次请求，严格一次性会让正常运行失败），子进程被回收时立即撤销，TTL 是后端先挂掉时的兜底。
- 运行凭据只允许运行体必需的端点：建轮次、读工作副本、读写 checkpoint、patch 校验/预演/应用、finalize/cancel、会话消息、能力发现。其余端点 403 并写 `run_token_scope` 拒绝审计；访问非绑定 resume 同样 403 并写同一条审计。
- `approve` / `reject` 不在白名单里，而是继续落到 `require_human_session`：任何非人类会话凭据一律 403 `FORBIDDEN`，并写 `run_human_session` 拒绝审计（PAT 仍写 `pat_human_session`）。
- 过期 / 未知 / 次数用尽 -> 401 或 403，并写 `run_token_auth` 拒绝审计；次数用尽时凭据被立即撤销。
- 子进程使用**最小环境**（PATH / LANG / PYTHONUNBUFFERED + 上述变量），不继承后端自身的 `DATABASE_URL`、`SETTINGS_SECRET_KEY` 等。
- apiKey 在 spawn 前由 Fernet 解密，只存在于该子进程生命周期；run 凭据同样不写盘、不写日志。
- 显式 `executionMode` 优先；缺省回退账户 `agent_config.nextRunMode`，都没有时子进程按默认 `approval`。运行凭据本身不能用请求体指定 mode（服务端解析），且来源固定 `agent`。

### 20.3 超时、并发与日志

- 硬超时 `AGENT_RUNNER_TIMEOUT_SECONDS`（默认 300s）：到点对子进程**进程组**发 `SIGKILL`（`start_new_session=True` + `os.killpg`），守候线程再 `wait()` 回收，避免僵尸。
- 并发 `AGENT_RUNNER_MAX_CONCURRENT`（默认 2，**进程内**计数）；超限直接 429，**不排队**。多 worker 部署时上限是「每 worker」，不是全局。
- 子进程 stdout/stderr 合并写入 `AGENT_RUNNER_LOG_DIR`（默认 `backend/var/agent-runs`）下 `<runId>.log`，目录 0700、文件 0600。日志只含子进程自身输出；后端不向日志注入 apiKey / cookie。
- 命令由 `AGENT_RUNNER_COMMAND` 配置（默认 `resumate-agent`，需在 PATH；测试指向桩脚本）。

### 20.4 安全边界与已知残余风险

- 子进程持有**按 run 限权的短时凭据**（8f5fe），不再持有用户的完整会话 cookie：泄露的影响面被限制在一个 resume、一段有限时间内，且进程被回收即失效。
- 已处理（83c41 的残余风险）：曾经注入完整会话 cookie 的做法已由 §20.2 的 run 凭据替换。
- 剩余风险：凭据在有效期内仍可读写它绑定的 resume（这是运行体的本职工；审批动作已由 `require_human_session` 挡住）；多 worker 部署下撤销依赖共享 Redis，未实现分布式强制终止。
- 模型密钥不会跨用户使用：后端始终读取**调用者本人**的 `user_settings.model_config`。

### 20.5 就绪探测

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | /agent/runtime | resume:read | 就绪探测：`available` 表示后端能在需要时启动运行体，不是已有常驻进程 |

- `available` 由 `shutil.which(AGENT_RUNNER_COMMAND)` 判定：命令能在 PATH 上解析即为 true。**探测不执行命令**，响应只含 `command` 与 `available`，不含任何密钥。
- 语义边界：`available=true` 只承诺「`POST /resumes/{id}/runs` 有机会 spawn 成功」，**不承诺**模型可用、也**不承诺**已有常驻运行体进程。前端据此把可用性派生为 model_missing / runtime_offline / available 三态。

## 21. 作用域泛化：resume 与 profile（fef83）

### 21.1 scope 语义

- 一个轮次（`agent_turns`）只有一个 `scope`：`resume` 或 `profile`。**scope 决定这一轮操作谁**：`resume` 轮次带 `resumeId`，`profile` 轮次不带任何简历。
- 会话（`agent_sessions`）**只绑 owner**，不绑 resume 或 profile：一次会话可以横跨多个简历与主档。scope 是轮次属性，不是会话属性。
- 待办（`agent_pending_actions`）用 `target` 镜像 scope：`target=resume` 走简历 patch / approve / apply 流程；`target=profile` 的 `ops` 是 `{op: create_fact | update_fact | update_basics, payload}`。
- 既有行在迁移后保持 `scope=resume` / `target=resume`（server_default），既有简历流程不变。

### 21.2 通用建轮次 POST /turns

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | /turns | resume:write | body 带 `scope`；`scope=resume` 必须 `resumeId`，`scope=profile` 必须 `sessionId` 且不接受 `resumeId` |
| GET | /sessions/{session_id}/turns | resume:read | 列出该会话的轮次，owner 隔离、最新优先，含 `pendingActions` |

- `POST /resumes/{resume_id}/turns` 保持既有契约：固定 `scope=resume`，`resumeId` 取自路径。
- 简历专属操作（`patches:validate|preview|apply`）对 profile 轮次返回 422 `VALIDATION_FAILED`；`finalize` / `cancel` 已泛化：profile 轮次没有 working copy，只负责关闭轮次（cancel 同时把未决 pending action 置 stale）。
- 同一会话内新建 profile 轮次会取代旧的 open profile 轮次（C-04 类比，旧的标记为 cancelled，未决 pending action 置 stale）。

### 21.3 profile 作用域 run

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | /sessions/{session_id}/runs | resume:write + 人类会话 | spawn 一次 profile run；body `{prompt}`；202 与简历 run 同构 |

- 会话必须属于调用者，否则 404；PAT 与 run 凭据一律 403 `FORBIDDEN`。
- 子进程拿到的 run 凭据**不绑定任何简历**（`resumeId=null`）。鉴权层只放行 `resumeId` 为空的轮次，因此 profile run 无法访问任何简历：这是作用域隔离的关键。
- 未配置模型仍返回 409 `MODEL_NOT_CONFIGURED`；并发满仍返回 429 `RATE_LIMITED`。

### 21.4 profile 待确认改动的审批语义

- approval 模式下，profile 改动先进入 pending action（`target=profile`，`kind=profile_change`）；`POST /pending-actions/{id}/approve` 才会**真正写入主档**，写入复用 `app/modules/profile/service.py` 的既有函数，不另写一套；reject 不动主档。
- full_access 模式下，stage 时立即写入，并保留一条 approved 记录用于审计。
- approve / reject 仍要求人类会话：run 凭据 403 `FORBIDDEN`（e9ad6 的越权路径没有被重新打开）。
- 创建 profile pending action 的 HTTP 端点是 `POST /turns/{turn_id}/profile-actions`（校验 `scope=profile`；run 凭据可调用，因为提交待确认改动不是人类决策）；approve / reject 仍必须人类会话，run 凭据 403。

### 21.5 profile run 的子进程、工具集与回复消息

- 后端 spawn profile run 时传 `--scope profile`（不带 `--resume-id`），凭据与 base url 仍按 §20.2 走环境变量。
- run 凭据白名单额外放行 `GET /profile`、`GET /profile/facts`、`POST /turns`、`GET /sessions/{id}/turns`、`POST /turns/{id}/profile-actions`。`test_run_token_allowlist.py` 用 AST 从 `client.py` 推导实际调用并比对，新增 client 方法会被自动纳管。
- agent-core 按 scope 注入工具：resume 保持原有 10 个工具；profile 注入 `capability` / `create_turn` / `get_turn` / `finalize_turn` / `cancel_turn` / `list_pending_actions` + `get_profile` + `propose_profile_change`，**不含** `get_working_document` / `validate_patch` / `preview_patch` / `apply_patch`。
- run 结束时把 Agent 的最终文字回复写成一条 `role=assistant`、`content={"text": "..."}` 的会话消息（`SessionJournal.reply`，取下一个 seq 并把游标移过它）。它是面向用户的回复，不属于模型上下文。

