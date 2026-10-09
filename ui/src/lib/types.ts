// 领域类型：严格对齐公共行为契约 C-01～C-13。
// 这些类型是 API 客户端、页面与 content 常量共享的唯一数据协议。

// ---------------------------------------------------------------------------
// 通用
// ---------------------------------------------------------------------------

export type ISODate = string

export type ExecutionMode = "approval" | "full_access"

export type VersionSource = "manual" | "agent" | "client" | "import" | "restore"

/** DES-007 保存与提交状态：区分本地未送达 / 服务端草稿 / 正式版本。 */
export type SaveState =
  | "local_unsynced" // 本地已改，服务端未确认收到（C-05）
  | "synced_draft" // 服务端已收草稿，未正式提交
  | "uncommitted" // 有草稿差异，等待 flush/finalize
  | "saving" // flush/finalize 进行中
  | "committed" // 已产生正式版本
  | "failed" // 保存失败，草稿保留
  | "frozen" // 授权撤销冻结（C-04）

/** DES-012 统一状态块。 */
export type LoadState = "idle" | "loading" | "ready" | "empty" | "error" | "conflict" | "forbidden"

/** 机器错误码（C-06）。 */
export type MachineErrorCode =
  | "BASE_VERSION_STALE" // 409
  | "TURN_ALREADY_CLOSED"
  | "SCOPE_INSUFFICIENT"
  | "RESOURCE_NOT_FOUND"
  | "TOKEN_REVOKED"
  | "TEMPLATE_IN_USE"
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED" // 401
  | "INVALID_CREDENTIALS" // 401
  | "ACCOUNT_BANNED" // 403
  | "FORBIDDEN" // 403
  | "EMAIL_ALREADY_REGISTERED" // 409
  | "EMAIL_NOT_VERIFIED" // 403（d7b99）
  | "VERIFICATION_TOKEN_INVALID" // 400（d7b99）
  | "RESEND_TOO_SOON" // 429（d7b99）
  | "RATE_LIMITED" // 429（d7b99）
  | "MODEL_NOT_CONFIGURED" // 409（83c41）
  | "UPSTREAM_TIMEOUT" // 504（fb67d）
  | "UPSTREAM_REJECTED" // 502（fb67d）
  | "MODEL_OUTPUT_INVALID" // 502（fb67d）
  | "PASSWORD_RESET_TOKEN_INVALID" // 400（b5586）

export interface ApiError {
  code: MachineErrorCode
  message: string
  latestVersionId?: string
}

// ---------------------------------------------------------------------------
// 会话与账号（b6708）
// ---------------------------------------------------------------------------

export type UserRole = "user" | "admin" | "super_admin"

export interface AuthUser {
  id: string
  email: string
  displayName: string
  /** 最高角色码，用于展示；完整角色与权限见 roles / permissions。 */
  role: UserRole
  roles: string[]
  permissions: string[]
  isBanned: boolean
  createdAt: ISODate
}

/** 用户管理投影（GET /auth/users）：role/roles 允许自定义角色码，不限制为内置三档。 */
export interface AdminUser {
  id: string
  email: string
  displayName: string
  role: string
  roles: string[]
  permissions: string[]
  isBanned: boolean
  createdAt: ISODate
}

/** 邮箱验证投递结果（d7b99）：202 中性响应，两种情况都不代表已登录。 */
export type VerificationSendStatus = "verification_sent" | "already_verified"

/** POST /auth/register 与 POST /auth/verification/resend 的响应体。 */
export interface VerificationAccepted {
  status: VerificationSendStatus
  email: string
}

/** 重发验证邮件：email（注册成功页）与 token（失效链接页）二选一，由后端校验。 */
export interface ResendVerificationInput {
  email?: string
  token?: string
}

/** 忘记密码投递结果（b5586）：202 中性响应，无论邮箱是否存在都返回同一形状。 */
export type PasswordResetSendStatus = "reset_sent"

/** POST /auth/password/forgot 的响应体。 */
export interface PasswordResetAccepted {
  status: PasswordResetSendStatus
  email: string
}

/** 重置密码：一次性令牌 + 新密码；成功为 204，无需下发会话。 */
export interface PasswordResetInput {
  token: string
  newPassword: string
}

export interface Role {
  id: string
  code: string
  name: string
  description: string
  rank: number
  isSystem: boolean
  permissions: string[]
}

export interface RoleInput {
  code: string
  name: string
  description?: string
  permissions: string[]
}

export interface RoleUpdateInput {
  name?: string
  description?: string
  permissions?: string[]
}

/** 权限码由代码目录拥有（端点静态声明），前端只读展示。 */
export interface Permission {
  id: string
  code: string
  group: string
  name: string
}

// ---------------------------------------------------------------------------
// 来源与证据（DES-009 / C-07）
// ---------------------------------------------------------------------------

export type EvidenceStatus = "verified" | "unverified" | "no_evidence"

export interface Provenance {
  kind: "profile_fact" | "user_input" | "jd_snapshot" | "agent_generated" | "template" | "external_client"
  label: string
  detail?: string
  factId?: string
  jdRevision?: number
  clientId?: string
  mode?: ExecutionMode
}

// ---------------------------------------------------------------------------
// Resume 文档（C-03）
// ---------------------------------------------------------------------------

export interface ResumeBasics {
  fullName: string
  headline: string
  email: string
  phone: string
  location: string
  links: { label: string; url: string }[]
}

export interface ResumeEntry {
  id: string // 稳定 ID，排序不改变身份
  title: string
  subtitle?: string
  period?: string
  location?: string
  bullets: string[]
  provenance?: Provenance
}

export interface ResumeSection {
  id: string
  kind: "summary" | "experience" | "projects" | "education" | "skills" | "certificates" | "custom"
  title: string
  entries: ResumeEntry[]
  /** summary 与 skills 这类以纯文本承载的章节 */
  text?: string
}

export interface ResumeDocument {
  basics: ResumeBasics
  sections: ResumeSection[]
}

// ---------------------------------------------------------------------------
// Resume 资源与版本
// ---------------------------------------------------------------------------

export interface ResumeVersion {
  id: string
  source: VersionSource
  actorId: string
  clientId?: string
  conversationId?: string
  userTurnId?: string
  agentRunId?: string
  editSessionId?: string
  executionMode?: ExecutionMode
  startedAt: ISODate
  committedAt: ISODate
  parentVersionId?: string
  baseVersionId?: string
  message: string
  changeCount: number
  affectedSections: string[]
  jdId?: string
  jdRevision?: number
}

export type ResumeLifecycle = "active" | "archived" | "deleted"

export interface Resume {
  id: string
  title: string
  targetRole: string
  tags: string[]
  templateId: string
  templateVersion: number
  currentVersionId: string
  lifecycle: ResumeLifecycle
  saveState: SaveState
  updatedAt: ISODate
  /** 反向关联：被哪些 JD 引用（C-13） */
  boundByJdIds: string[]
  /** 软删除恢复截止（依赖 D-01，未冻结时为占位说明） */
  restoreDeadline?: ISODate
  profileId?: string
  document: ResumeDocument
  /** 服务端草稿缓冲（C-05）：自动保存写入、尚未提交成版本的内容；无草稿时为 null。 */
  draft?: ResumeDocument | null
  versions: ResumeVersion[]
}

// ---------------------------------------------------------------------------
// Diff（DES-005 / C-01 / C-06）
// ---------------------------------------------------------------------------

export type DiffChangeType = "added" | "removed" | "modified"
export type DiffItemState = "pending" | "accepted" | "rejected" | "dependency_error" | "stale"

export interface DiffItem {
  id: string
  target: string // 例如 "经历 · 高级前端工程师 · 第 2 条"
  changeType: DiffChangeType
  before?: string
  after?: string
  reason: string
  provenance?: Provenance
  state: DiffItemState
}

// ---------------------------------------------------------------------------
// Agent Run / PendingAction（C-01 / C-04 / C-09）
// ---------------------------------------------------------------------------

export type RunEventKind = "message" | "tool_progress" | "pending_action" | "cancel" | "error" | "finalize"

export interface RunTimelineEvent {
  id: string
  kind: RunEventKind
  at: ISODate
  role?: "user" | "agent"
  text: string
  toolName?: string
}

export type PendingActionState = "pending" | "approved" | "rejected" | "stale" | "executing" | "consumed"

export type PendingActionKind =
  | "content_patch"
  | "profile_change"
  | "create_resume"
  | "delete"
  | "restore"
  | "fact_promotion"
  | "profile_sync"
  | "metadata"

export interface PendingAction {
  id: string
  /** 后端未暴露 tool call id；从真实轮次映射时缺省。 */
  toolCallId?: string
  kind: PendingActionKind
  title: string
  targetResource: string
  baseVersionId?: string
  impactSummary: string
  requiresTextConfirm: boolean
  state: PendingActionState
  staleReason?: string
  diff?: DiffItem[]
}

export type RunState =
  | "running"
  | "awaiting_confirm"
  | "approved"
  | "rejected"
  | "cancelling"
  | "partial_success"
  | "over_budget"
  | "failed"
  | "frozen"
  | "turn_closed"

export interface AgentRun {
  id: string
  resumeId: string
  conversationId: string
  /** 该轮次绑定的会话；新的一轮续用它，避免同一简历每轮另起一个会话。 */
  sessionId?: string
  userTurnId: string
  executionMode: ExecutionMode // 服务端固化（C-02）
  modeSource: "session" | "agent" | "account"
  state: RunState
  budget: { usedTokens: number; maxTokens: number; usedTurns: number; maxTurns: number; costUsd: number }
  timeline: RunTimelineEvent[]
  pendingActions: PendingAction[]
}

/** GET /turns/{id} 返回的后端轮次投影（契约 §4.1）。 */
export interface ApiTurnPendingAction {
  id: string
  userTurnId: string
  /** profile 轮次的待办 kind 为 profile_change（契约 §21.4）。 */
  kind: "content_patch" | "profile_change"
  title: string
  /** 简历待办为 resumeId；profile 待办没有绑定资源（后端返回 null）。 */
  targetResource: string | null
  baseVersionId?: string | null
  impactSummary: string
  requiresTextConfirm: boolean
  state: "pending" | "approved" | "rejected" | "consumed" | "stale"
  staleReason?: string | null
  diff?: DiffItem[]
}

export interface ApiTurn {
  id: string
  /** resume 轮次带简历；profile 轮次不带任何简历（契约 §21.1）。 */
  scope?: "resume" | "profile"
  resumeId: string | null
  clientId?: string
  source?: string
  executionMode: ExecutionMode
  modeSource: "session" | "agent" | "account"
  state: "open" | "finalized" | "cancelled"
  baseVersionId?: string | null
  sessionId?: string | null
  message?: string
  createdAt?: string
  closedAt?: string | null
  result?: { state: string; versionId?: string | null; changeCount?: number; message?: string } | null
  pendingActions?: ApiTurnPendingAction[]
}

/** GET /sessions 返回的会话（契约 §19.1）。只绑 owner，一个会话可横跨多份简历与主档。 */
export interface AgentSession {
  id: string
  createdAt: ISODate
  updatedAt: ISODate
  lastActiveAt: ISODate
}

export type SessionMessageRole = "system" | "user" | "assistant" | "tool"

/**
 * 会话消息（契约 §19.1）。content 是不透明 JSON：运行体写完整 Message wire
 * （`{role, content, toolCalls?, ...}`），前端追加用户消息时也写同一形态，
 * 让历史能被同一套解析消费。
 */
export interface AgentSessionMessage {
  id: string
  sessionId: string
  /** 会话内单调递增的消息身份；(session_id, seq) 幂等。 */
  seq: number
  role: SessionMessageRole
  content: unknown
  createdAt: ISODate
}

/** POST /sessions/{id}/messages 的入参：seq 由调用方分配（契约 §19.3）。 */
export interface SessionMessageInput {
  seq: number
  role: SessionMessageRole
  content: unknown
}

/** GET /turns/{id}/state 返回的 run checkpoint（契约 §19）。 */
export interface TurnStateResponse {
  turnId: string
  runState: {
    budget?: { tokensUsed?: number; maxTokens?: number; turnsUsed?: number; maxTurns?: number; costUsedUsd?: number }
    [key: string]: unknown
  }
  stateVersion: number
}

// ---------------------------------------------------------------------------
// Profile（C-07）
// ---------------------------------------------------------------------------

export type FactType = "experience" | "project" | "skill" | "education" | "achievement" | "certificate"
export type FactVisibility = "private" | "resume_only" | "public"

export interface ProfileFact {
  id: string
  type: FactType
  title: string
  content: string
  tags: string[]
  source: string
  evidence: { status: EvidenceStatus; label?: string; downloadable?: boolean }
  confidence: number // 0-1
  verifiedAt?: ISODate
  visibility: FactVisibility
  /** 被哪些 Resume/Version 使用（反向引用） */
  referencedBy: { resumeId: string; resumeTitle: string; versionId: string }[]
}

export interface ProfileVersion {
  id: string
  createdAt: ISODate
  message: string
  factCount: number
}

/**
 * 直接编辑（表单）写入事实的输入。
 * 与对话解析结果分开：表单里的内容由用户直接填写，不经过模型推断（BR-D09）。
 */
export interface ProfileFactInput {
  type: FactType
  title: string
  content: string
  tags: string[]
  evidence: { status: EvidenceStatus; label?: string }
  visibility: FactVisibility
}

export interface Profile {
  id: string
  ownerId: string
  displayName: string
  completeness: number // 0-100
  /** 主档基本信息（个人资料页顶部，像简历表头） */
  basics: ResumeBasics
  facts: ProfileFact[]
  versions: ProfileVersion[]
}

// ---------------------------------------------------------------------------
// JD 自然语言 / 截图创建
// ---------------------------------------------------------------------------

export interface ProposedJd {
  role: string
  company?: string
  tags: string[]
  body: string
  sourceUrl?: string
  extracted: { label: string; value: string }[]
  parseConfidence: number
  note: string
  inputSource: "text" | "image"
}

export interface JobMatchResult {
  factId: string
  factTitle: string
  relevance: number // 0-1
  reason: string
  evidenceStatus: EvidenceStatus
}

export interface MatchGap {
  requirement: string
  status: "covered" | "partial" | "missing"
  note: string
}

// ---------------------------------------------------------------------------
// JD（C-13）
// ---------------------------------------------------------------------------

export interface JobDescription {
  id: string
  ownerId: string
  role: string
  company?: string
  body: string
  sourceUrl?: string
  tags: string[]
  revision: number
  createdAt: ISODate
  updatedAt: ISODate
  boundResumeId?: string
  boundResumeAvailable?: boolean
}

// ---------------------------------------------------------------------------
// 模板（C-08）
// ---------------------------------------------------------------------------

export type TemplateStatus = "draft" | "validating" | "validation_failed" | "published" | "retired"

export interface ResumeTemplate {
  id: string
  name: string
  status: TemplateStatus
  revision: number
  referenceCount: number
  publisher: string
  publishedAt?: ISODate
  retiredReason?: string
  validationErrors: string[]
}

// ---------------------------------------------------------------------------
// 设置与 Agent 配置（C-02 / C-10）
// ---------------------------------------------------------------------------

export interface AgentConfig {
  currentRunMode?: ExecutionMode // 运行中固化的模式
  nextRunMode: ExecutionMode // 后续 Run 默认
  modeSource: "session" | "agent" | "account"
  fullAccessScopes: string[]
  confirmRetainedOps: string[]
  budget: { maxTokens: number; maxTurns: number; maxCostUsd: number }
}

export interface ModelTestResult {
  at: ISODate
  ok: boolean
  message: string
}

export interface ModelConfig {
  provider: string
  endpoint: string
  model: string
  keyConfigured: boolean // 凭证不回显（BR-D17）
  lastTest?: ModelTestResult
}

/** 运行体就绪探测（GET /agent/runtime）：available=false 时无法在需要时启动运行体。 */
export interface RuntimeStatus {
  command: string
  available: boolean
}

export interface ModelConfigUpdate {
  provider?: string
  endpoint?: string
  model?: string
  /** write-only：仅提交，后端不回显 */
  apiKey?: string
}

// ---------------------------------------------------------------------------
// 语音识别（云端 ASR，语音链路真实化）：与模型配置同构，apiKey 永不回显。
// ---------------------------------------------------------------------------

export interface SpeechTestResult {
  at: ISODate
  ok: boolean
  message: string
}

export interface SpeechConfig {
  provider: string
  /** 地域决定默认接入域名；cn-beijing / ap-southeast-1 */
  region: string
  /** 自定义 Endpoint；为空时用地域默认域名 */
  endpoint: string
  model: string
  keyConfigured: boolean
  lastTest?: SpeechTestResult
}

export interface SpeechConfigUpdate {
  provider?: "dashscope"
  region?: "cn-beijing" | "ap-southeast-1"
  endpoint?: string
  model?: string
  /** write-only：仅提交，后端不回显 */
  apiKey?: string
}

// ---------------------------------------------------------------------------
// 模型目录（契约 §17 / 9546b）：只读，条目来自后端维护的 models.dev 快照。
// ---------------------------------------------------------------------------

export interface ModelCatalogModel {
  id: string
  label: string
  /** 上下文窗口（token） */
  contextWindow?: number
  maxOutputTokens?: number
  inputCostPerMillion?: number
  outputCostPerMillion?: number
}

export interface ModelCatalogProvider {
  id: string
  label: string
  models: ModelCatalogModel[]
}

export interface ModelCatalog {
  /** 目录来源，固定为 "models.dev" */
  source: string
  providers: ModelCatalogProvider[]
}

export interface UserPreferences {
  theme: "paper" | "dark"
  language: string
  displayName: string
  autosave: boolean
  /** 空闲自动保存的静默秒数（C-05）；默认 10，合法区间 3–120。 */
  autosaveIntervalSeconds: number
  defaultTemplateId: string
  defaultTemplateRetired?: boolean
  shortcuts: { action: string; keys: string; conflict?: boolean }[]
}

export interface AgentConfigUpdate {
  nextRunMode?: ExecutionMode
  budget?: Partial<AgentConfig["budget"]>
}

export type UserPreferencesUpdate = Partial<
  Pick<UserPreferences, "theme" | "language" | "displayName" | "autosave" | "autosaveIntervalSeconds" | "defaultTemplateId" | "shortcuts">
>

// ---------------------------------------------------------------------------
// 开放接入（C-10）
// ---------------------------------------------------------------------------

export type PatStatus = "active" | "expiring" | "revoked"

export interface PersonalAccessToken {
  id: string
  name: string
  scopes: string[]
  resources: string[]
  fields: string[]
  purpose: string
  createdAt: ISODate
  expiresAt: ISODate
  lastUsedAt?: ISODate
  status: PatStatus
  /** 仅创建成功一次显示 */
  secretOnce?: string
}

export interface PersonalAccessTokenInput {
  name: string
  scopes: string[]
  purpose?: string
  resources?: string[]
  fields?: string[]
  expiresInDays?: number
}

/** 备份 JSON 载荷：格式由后端 resumate-backup/1.0 定义。 */
export type BackupPayload = Record<string, unknown>

export interface ImportCounts {
  resumes: number
  versions: number
  profiles: number
  facts: number
  jds: number
}

export interface ImportResult {
  imported: ImportCounts
  idMappings: ImportPreview["idMappings"]
  bindingRestores: ImportPreview["bindingRestores"]
}

export interface AccessLogEntry {
  id: string
  at: ISODate
  clientId: string
  scope: string
  resource: string
  purpose: string
  result: "allowed" | "denied" | "frozen"
  errorCode?: MachineErrorCode
}

/** GET /access/logs 查询参数：page/size 与后端 PaginationParams 对齐，其余为筛选。 */
export interface AccessLogQuery {
  page?: number
  size?: number
  purpose?: string
  result?: AccessLogEntry["result"]
  /** 关键字，匹配 clientId / scope / resource。 */
  q?: string
  /** 起始时间（ISO 8601，闭区间下界）。 */
  from?: string
  /** 结束时间（ISO 8601，闭区间上界）。 */
  to?: string
}

/**
 * GET /access/logs 的客户端投影：响应体是裸数组，筛选后的总条数来自
 * X-Total-Count 响应头；响应头缺失时为 null（前端退化为逐页判断是否还有下一页）。
 */
export interface AccessLogPage {
  items: AccessLogEntry[]
  total: number | null
}

export interface CapabilityDiscovery {
  contractVersion: string
  openapiUrl: string
  mcpUrl: string
  wellKnownUrl: string
  authMethods: string[]
  capabilities: string[]
}

// ---------------------------------------------------------------------------
// 备份迁移（C-07）
// ---------------------------------------------------------------------------

export interface BackupManifest {
  formatVersion: string
  resourceCounts: { resumes: number; versions: number; profiles: number; facts: number; jds: number }
  attachments: { name: string; downloadable: boolean }[]
}

export interface ImportPreview {
  manifest: BackupManifest
  newResources: { type: string; title: string }[]
  idMappings: { originalId: string; newId: string; type: string }[]
  bindingRestores: { jd: string; resume: string; status: "mapped" | "unmapped" }[]
  missingReferences: string[]
  status: "valid" | "has_issues"
}

// ---------------------------------------------------------------------------
// 工作台聚合（SCR-001）
// ---------------------------------------------------------------------------

export interface WorkbenchSummary {
  latestResume?: Resume
  uncommittedDraftCount: number
  pendingActionCount: number
  conflictCount: number
  frozenDraftCount: number
  latestJd?: JobDescription
  profileCompleteness: number
  unverifiedFactCount: number
  jobStage: { label: string; done: boolean }[]
  hasProfile: boolean
}
