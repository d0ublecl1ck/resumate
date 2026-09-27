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
  | "create_resume"
  | "delete"
  | "restore"
  | "fact_promotion"
  | "profile_sync"
  | "metadata"

export interface PendingAction {
  id: string
  toolCallId: string
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
  userTurnId: string
  executionMode: ExecutionMode // 服务端固化（C-02）
  modeSource: "session" | "agent" | "account"
  state: RunState
  budget: { usedTokens: number; maxTokens: number; usedTurns: number; maxTurns: number; costUsd: number }
  timeline: RunTimelineEvent[]
  pendingActions: PendingAction[]
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
 * 自然语言解析出的「事实变更建议」（对话式新增/更新）。
 * C-07：Agent 从自然语言得到的内容一律是「建议」，需用户显式确认后才成为事实；
 * 解析产出的证据状态默认非 verified（模型推断不等于事实）。
 */
export interface ProposedFactChange {
  operation: "create" | "update"
  /** operation=update 时指向被更新的事实 */
  targetFactId?: string
  targetFactTitle?: string
  type: FactType
  title: string
  content: string
  tags: string[]
  /** 结构化抽取结果，便于用户逐项核对 */
  extracted: { label: string; value: string }[]
  evidenceStatus: EvidenceStatus
  /** 解析置信度 0-1（仅用于提示，不代表事实可信度） */
  parseConfidence: number
  note: string
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
// Profile 助手：自然语言输入的统一解析结果
// ---------------------------------------------------------------------------

export type BasicsField = "fullName" | "headline" | "email" | "phone" | "location"

/** 对基本信息的变更建议（对话式修改），确认后写入。 */
export interface ProposedBasicsChange {
  fields: { key: BasicsField; label: string; before: string; after: string }[]
  parseConfidence: number
  note: string
}

/** Profile 助手一次输入的解析结果：要么改基本信息，要么新增/更新一段经历类事实。 */
export type ProfileInputResult =
  | { kind: "fact"; change: ProposedFactChange }
  | { kind: "basics"; change: ProposedBasicsChange }

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

export interface ModelConfigUpdate {
  provider?: string
  endpoint?: string
  model?: string
  /** write-only：仅提交，后端不回显 */
  apiKey?: string
}

export interface UserPreferences {
  theme: "paper" | "dark"
  language: string
  displayName: string
  autosave: boolean
  defaultTemplateId: string
  defaultTemplateRetired?: boolean
  shortcuts: { action: string; keys: string; conflict?: boolean }[]
}

export interface AgentConfigUpdate {
  nextRunMode?: ExecutionMode
  budget?: Partial<AgentConfig["budget"]>
}

export type UserPreferencesUpdate = Partial<
  Pick<UserPreferences, "theme" | "language" | "displayName" | "autosave" | "defaultTemplateId" | "shortcuts">
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
