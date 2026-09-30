# Resumate API 参考（resumate-api-operations）

> 配套 `SKILL.md`。字段集合以冻结契约 `docs/agent/agent-operation-api.md` 为唯一基线；`ResumeDocument` / `ResumeBasics` / `ResumeSection` / `ResumeEntry` 的字段取自仓库 ResumeDocument schema（契约 §4.2、C-03），不得扩展。
> 契约版本：v1（P0）；工单：58d30。

## 1. 传输与公共约定

| 约定 | 值 |
| --- | --- |
| JSON 命名 | 请求/响应一律 camelCase（后端 snake_case + alias） |
| 错误信封 | `{ code, message, latestVersionId? }` |
| ID 前缀 | 轮次 `turn_`、待办 `pa_`、简历 `res_`、版本 `ver_` |
| 鉴权 | `Authorization: Bearer rsm_pat_...` 优先；未命中回落 HttpOnly 会话 Cookie `resumate_session`；PAT 的 scope 必须包含端点权限码 |
| 权限码 | 读 `resume:read`；写 `resume:write` |
| base URL | 服务根路径（无 `/api` 前缀），本地 `http://localhost:8000` |

## 2. 资源模型字段表

### 2.1 UserTurnResponse

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | `turn_` 前缀的 user_turn_id |
| `resumeId` | string | 目标简历 |
| `clientId` | string | 调用方标识，默认 `"external"` |
| `source` | `"agent" \| "manual" \| "client"` | 缺省 `"agent"`；服务端不信任伪造值 |
| `executionMode` | `"approval" \| "full_access"` | 固化模式 |
| `modeSource` | `"session" \| "agent" \| "account"` | 模式来源 |
| `state` | `"open" \| "finalized" \| "cancelled"` | 轮次状态 |
| `baseVersionId` | string \| null | 轮次开始时的正式版本 |
| `message` | string | 轮次说明 |
| `createdAt` | datetime | |
| `closedAt` | datetime \| null | |
| `result` | TurnResult \| null | 关闭后结果 |
| `pendingActions` | PendingActionResponse[] | 该轮次待办投影 |

### 2.2 TurnResult

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `state` | `"finalized" \| "cancelled"` | |
| `resumeId` | string | |
| `versionId` | string \| null | 无内容变化时为 null，不创建空版本（C-03） |
| `changeCount` | int | |
| `affectedSections` | string[] | |
| `message` | string | |
| `idempotentReplay` | bool | 是否命中幂等重放 |

### 2.3 WorkingDocumentResponse

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `resumeId` | string | |
| `document` | ResumeDocument | 当前 Working Copy（无暂存时返回正式 document） |
| `baseVersionId` | string \| null | Working Copy 基于的正式版本 |
| `userTurnId` | string \| null | 占有 Working Copy 的轮次 |
| `workingRevision` | int | 暂存修订号，每次成功 apply +1 |
| `dirty` | bool | Working Copy 是否不同于正式 document |

### 2.4 PendingActionResponse

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | `pa_` 前缀 |
| `userTurnId` | string | 所属轮次 |
| `kind` | `"content_patch"` | 本期仅内容 Patch |
| `title` | string | 展示标题 |
| `targetResource` | string | resumeId |
| `baseVersionId` | string \| null | |
| `impactSummary` | string | 影响摘要 |
| `requiresTextConfirm` | bool | 本期统一 `false` |
| `state` | `"pending" \| "approved" \| "rejected" \| "consumed" \| "stale"` | |
| `staleReason` | string \| null | |
| `diff` | DiffItem[] | 与 UI DiffItem 对齐 |
| `createdAt` | datetime | |
| `decidedAt` | datetime \| null | |

### 2.5 DiffItem

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 稳定 diff id |
| `target` | string | 人读定位，如 `"经历 · 高级前端工程师"` |
| `changeType` | `"added" \| "removed" \| "modified"` | |
| `before` | string \| null | |
| `after` | string \| null | |
| `reason` | string | 来自 Patch.reason |
| `state` | `"pending" \| "accepted" \| "rejected"` | |

## 3. Patch 类型

### 3.1 PatchRequest

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ops` | PatchOp[] | 是 | 至少 1 条，按数组顺序应用 |
| `reason` | string | 否 | 默认 `""` |
| `baseVersionId` | string \| null | 否 | 与轮次基线不一致时返回 `BASE_VERSION_STALE` |

### 3.2 PatchOp（判别联合，字段 `op`）

| `op` | 字段 | 说明 |
| --- | --- | --- |
| `setBasics` | `basics`（完整 ResumeBasics） | 整体替换 basics |
| `upsertSection` | `section`（完整 ResumeSection） | 按 `section.id` 插入或整体替换 |
| `removeSection` | `sectionId` | 删除；不存在 `SECTION_NOT_FOUND` |
| `upsertEntry` | `sectionId`、`entry`（完整 ResumeEntry） | 按 `entry.id` 插入或替换；section 不存在 `SECTION_NOT_FOUND` |
| `removeEntry` | `sectionId`、`entryId` | 删除；section 或 entry 不存在返回对应 `NOT_FOUND` |

### 3.3 ResumeDocument 及其子类型

ResumeDocument：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `basics` | ResumeBasics | |
| `sections` | ResumeSection[] | 覆盖 summary / experience / projects / education / skills / certificates / custom |

ResumeBasics：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `fullName` | string | |
| `headline` | string | |
| `email` | string | |
| `phone` | string | |
| `location` | string | |
| `links` | Link[] | |

Link：`label`、`url`。

ResumeSection：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 稳定 ID，排序不改变身份 |
| `kind` | string | 见 §5 枚举 |
| `title` | string | |
| `entries` | ResumeEntry[] | |
| `text` | string \| null | summary 等文本型章节使用 |

ResumeEntry：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 稳定 ID |
| `title` | string | |
| `subtitle` | string \| null | |
| `period` | string \| null | |
| `location` | string \| null | |
| `bullets` | string[] | |
| `provenance` | Provenance \| null | 来源 |

Provenance：`kind`（见 §5 枚举）、`label`、`detail`（string \| null）、`factId`（string \| null）。

## 4. 端点请求 / 响应字段表

所有写端点失败时返回错误信封 `{ code, message, latestVersionId? }`。

### 4.1 POST /resumes/{resume_id}/turns

| 位置 | 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- | --- |
| path | `resume_id` | 是 | string | 目标简历 |
| body | `baseVersionId` | 否 | string \| null | 指定基线 |
| body | `executionMode` | 否 | string | 显式请求模式（服务端解析并固化） |
| body | `clientId` | 否 | string | 默认 `"external"` |
| body | `source` | 否 | string | 默认 `"agent"`；服务端不信任伪造值 |
| body | `message` | 否 | string | 轮次说明 |

响应：`201` + UserTurnResponse（§2.1）。

### 4.2 GET /turns/{turn_id}

| 位置 | 字段 | 必填 | 类型 |
| --- | --- | --- | --- |
| path | `turn_id` | 是 | string |

响应：UserTurnResponse（§2.1）。无 body。

### 4.3 POST /turns/{turn_id}/finalize

| 位置 | 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- | --- |
| path | `turn_id` | 是 | string | |
| body | `idempotencyKey` | 否 | string | 重试复用同一个 key |
| body | `message` | 否 | string | |

响应：UserTurnResponse（`result` 非空）。

### 4.4 POST /turns/{turn_id}/cancel

| 位置 | 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- | --- |
| path | `turn_id` | 是 | string | |
| body | `idempotencyKey` | 否 | string | |
| body | `reason` | 否 | string | |

响应：UserTurnResponse。

### 4.5 POST /turns/{turn_id}/patches:validate

| 位置 | 字段 | 必填 | 类型 |
| --- | --- | --- | --- |
| path | `turn_id` | 是 | string |
| body | `ops` | 是 | PatchOp[] |
| body | `reason` | 否 | string |
| body | `baseVersionId` | 否 | string \| null |

响应 PatchValidationResponse：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `valid` | bool | 是否有可应用候选 |
| `errors` | `[{ opIndex, code, message }]` | 全量可判定错误 |

### 4.6 POST /turns/{turn_id}/patches:preview

请求同 4.5。响应 PatchPreviewResponse：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `valid` | bool | |
| `resumeId` | string | |
| `baseVersionId` | string \| null | |
| `changeCount` | int | |
| `affectedSections` | string[] | |
| `diff` | DiffItem[] | |
| `pendingActionId` | string \| null | approval 下为新待办 ID |
| `requiresConfirmation` | bool | 是否需要用户确认 |

### 4.7 POST /turns/{turn_id}/patches:apply

| 位置 | 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- | --- |
| path | `turn_id` | 是 | string | |
| body | `ops` | 是 | PatchOp[] | |
| body | `reason` | 否 | string | |
| body | `baseVersionId` | 否 | string \| null | 与简历当前版本不一致 → BASE_VERSION_STALE |
| body | `pendingActionId` | 否 | string | approval 必填且须为 approved |
| body | `idempotencyKey` | 否 | string | 写操作建议必填 |

响应 PatchApplyResponse：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `applied` | bool | |
| `userTurnId` | string | |
| `resumeId` | string | |
| `changeCount` | int | |
| `affectedSections` | string[] | |
| `workingRevision` | int | 每次成功 apply +1 |
| `pendingActionId` | string \| null | 被消费的待办 |
| `idempotentReplay` | bool | |

### 4.8 GET /turns/{turn_id}/pending-actions

| 位置 | 字段 | 必填 | 类型 |
| --- | --- | --- | --- |
| path | `turn_id` | 是 | string |

响应：PendingActionResponse[]（§2.4）。无 body。

### 4.9 GET /resumes/{resume_id}/working-document

| 位置 | 字段 | 必填 | 类型 |
| --- | --- | --- | --- |
| path | `resume_id` | 是 | string |

响应：WorkingDocumentResponse（§2.3）。无 body。

### 4.10 POST /pending-actions/{action_id}/approve

审批是人类动作，仅接受浏览器会话；PAT / Agent 来源返回 403 `FORBIDDEN`。

| 位置 | 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- | --- |
| path | `action_id` | 是 | string | `pa_` 前缀 |
| body | `{}` | 否 | object | 可为空或省略 |

响应：PendingActionResponse（`pending → approved`）。

### 4.11 POST /pending-actions/{action_id}/reject

请求同 4.10；同样仅接受浏览器会话，PAT / Agent 来源返回 403 `FORBIDDEN`。响应：PendingActionResponse（`pending → rejected`）。

## 5. 枚举参考

| 枚举 | 取值 |
| --- | --- |
| `executionMode` | `approval` \| `full_access` |
| `modeSource` | `session` \| `agent` \| `account` |
| UserTurn `state` | `open` \| `finalized` \| `cancelled` |
| TurnResult `state` | `finalized` \| `cancelled` |
| `source` | `agent` \| `manual` \| `client` |
| PendingAction `kind` | `content_patch` |
| PendingAction `state` | `pending` \| `approved` \| `rejected` \| `consumed` \| `stale` |
| DiffItem `changeType` | `added` \| `removed` \| `modified` |
| DiffItem `state` | `pending` \| `accepted` \| `rejected` |
| ResumeSection `kind` | `summary` \| `experience` \| `projects` \| `education` \| `skills` \| `certificates` \| `custom` |
| Provenance `kind` | `profile_fact` \| `user_input` \| `jd_snapshot` \| `agent_generated` \| `template` \| `external_client` |

状态机：

- UserTurn：`open → finalized`（finalize）、`open → cancelled`（cancel）。已关闭轮次的写请求返回 `TURN_ALREADY_CLOSED`；读取仍可用。
- PendingAction：`pending → approved → consumed`（apply 消费）、`pending → rejected`、`pending → stale`（基线或负载变化）。已非 `pending` 的 approve/reject 返回 `VALIDATION_FAILED`。
- Working Copy：首个 apply 时以轮次 `baseVersionId` 从正式 document 派生；finalize 成功后清空；cancel 时若有已应用修改则按 C-04 结算后清空。

## 6. 错误码全集（契约相关）

| code | HTTP | 说明 | 恢复动作 |
| --- | --- | --- | --- |
| `BASE_VERSION_STALE` | 409 | 基线过期；带 `latestVersionId` | 重读 document + 重新 preview |
| `REBASE_CONFLICT` | 409 | 暂存改动与最新基线冲突；带 `latestVersionId`，暂存保留 | 读 working-document 后在新底座上重新提案 |
| `TURN_ALREADY_CLOSED` | 409 | 对已关闭轮次写 | 开新轮次 |
| `PENDING_ACTION_NOT_APPROVED` | 409 | approval 下 apply 缺已批准待办 | 先 approve |
| `IDEMPOTENCY_CONFLICT` | 409 | 同 key 不同负载 | 换新 key |
| `VALIDATION_FAILED` | 422 | Schema/负载错误；或对已非 pending 待办审批 | 修 payload / 刷新待办 |
| `TURN_NOT_OPEN` | 409 | 轮次非 open | 读状态；开新轮或等待 |
| `PENDING_ACTION_STALE` | 409 | 确认已失效 | 重新 preview + approve |
| `SECTION_NOT_FOUND` | 见校验响应 | Patch 引用的 section/entry 不存在 | 读 Working Copy 后重算 ops |
| `RESOURCE_NOT_FOUND` | 404 | `resume_id` / `turn_id` / `action_id` 不存在或无权 | 校验 ID 与所有权 |
| `UNAUTHENTICATED` | 401 | 未登录或会话过期 | 重新登录 |
| `INVALID_CREDENTIALS` | 401 | 凭证错误 | 停止并反馈用户 |
| `TOKEN_REVOKED` | 401 | PAT 已撤销 | 重新签发令牌 |
| `ACCOUNT_BANNED` | 403 | 账号被封禁 | 停止 |
| `FORBIDDEN` | 403 | 缺少权限码；或 PAT / Agent 来源调用 approve / reject | 停止并报告；审批请用户在自己的浏览器会话完成 |
| `SCOPE_INSUFFICIENT` | 403 | PAT 的 scope 不含端点权限码 | 停止，不得扩权；补 `resume:read` / `resume:write` |

## 7. 幂等键速查

| 端点 | 是否支持 idempotencyKey | 建议 key |
| --- | --- | --- |
| POST /resumes/{resume_id}/turns | 否 | —（重试前先读 turn 状态） |
| GET /turns/{turn_id} | 不适用 | — |
| POST /turns/{turn_id}/finalize | 是 | `finalize-{turn_id}-{n}` |
| POST /turns/{turn_id}/cancel | 是 | `cancel-{turn_id}-{n}` |
| POST /turns/{turn_id}/patches:validate | 否（无副作用） | — |
| POST /turns/{turn_id}/patches:preview | 否 | —（保存 pendingActionId） |
| POST /turns/{turn_id}/patches:apply | 是 | `apply-{turn_id}-{n}` |
| GET /turns/{turn_id}/pending-actions | 不适用 | — |
| GET /resumes/{resume_id}/working-document | 不适用 | — |
| POST /pending-actions/{action_id}/approve | 否 | — |
| POST /pending-actions/{action_id}/reject | 否 | — |

规则：同一轮次 + 操作类型 + 相同 key + 相同负载 → 原结果 + `idempotentReplay=true`；相同 key 不同负载 → `409 IDEMPOTENCY_CONFLICT`。
