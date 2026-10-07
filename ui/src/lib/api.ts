// API 客户端：严格镜像 FastAPI 公共契约端点（C-10 能力表）。
//
// 约定：每个函数对应一个真实 REST 端点，注释里写明 METHOD + path。
// 后端已实现的端点走真实 HTTP（api-client.ts）；未实现的端点仍从 lib/content.ts
// 读取 mock，待对应后端能力落地后再替换，函数签名与入参、返回类型保持不变。

import { CURRENT_USER, JOB_MATCHES } from "./content"
import type {
  AccessLogEntry,
  AgentConfig,
  AgentSession,
  AgentSessionMessage,
  AgentConfigUpdate,
  AgentRun,
  ApiTurn,
  ApiTurnPendingAction,
  AuthUser,
  BackupPayload,
  CapabilityDiscovery,
  ExecutionMode,
  ImportPreview,
  ImportResult,
  JobDescription,
  JobMatchResult,
  MatchGap,
  ModelConfig,
  ModelCatalog,
  Permission,
  Role,
  RoleInput,
  RoleUpdateInput,
  ModelConfigUpdate,
  ModelTestResult,
  PersonalAccessToken,
  PersonalAccessTokenInput,
  Profile,
  ProfileFact,
  ProfileFactInput,
  ProposedJd,
  ResumeBasics,
  Resume,
  ResumeDocument,
  ResumeTemplate,
  ResumeVersion,
  RunTimelineEvent,
  RuntimeStatus,
  TurnStateResponse,
  UserPreferences,
  UserPreferencesUpdate,
  PendingAction,
  PasswordResetAccepted,
  SessionMessageInput,
  PasswordResetInput,
  ResendVerificationInput,
  VerificationAccepted,
  WorkbenchSummary,
} from "./types"
import { request, requestText } from "./api-client"
import { buildRunTimeline } from "./run-conversation"
import i18n from "@/i18n"

// 模拟网络延迟，方便页面演示 loading 状态。设为 0 可关闭。
const LATENCY = 0
function resolve<T>(data: T): Promise<T> {
  return new Promise((r) => (LATENCY ? setTimeout(() => r(structuredClone(data)), LATENCY) : r(structuredClone(data))))
}

// ---------------------------------------------------------------------------
// 认证：注册 / 登录 / 登出 / 当前用户（b6708）
// ---------------------------------------------------------------------------

/** GET /auth/me */
export function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>("/auth/me")
}

/** POST /auth/login */
export function login(email: string, password: string): Promise<AuthUser> {
  return request<AuthUser>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })
}

/** POST /auth/register —— 202 中性响应，不下发会话；登录态只能由邮箱验证或 login 产生（d7b99）。 */
export function register(input: { email: string; password: string; displayName: string }): Promise<VerificationAccepted> {
  return request<VerificationAccepted>("/auth/register", { method: "POST", body: JSON.stringify(input) })
}

/** POST /auth/verification/resend —— email 或 token 二选一（d7b99）。 */
export function resendVerification(input: ResendVerificationInput): Promise<VerificationAccepted> {
  return request<VerificationAccepted>("/auth/verification/resend", { method: "POST", body: JSON.stringify(input) })
}

/** POST /auth/verification/verify —— 消费一次性令牌，成功时下发 HttpOnly 会话 Cookie。 */
export function verifyEmail(token: string): Promise<AuthUser> {
  return request<AuthUser>("/auth/verification/verify", { method: "POST", body: JSON.stringify({ token }) })
}

/** POST /auth/password/forgot —— 202 中性响应，命中账号才发一次性重置链接（b5586）。 */
export function forgotPassword(input: { email: string }): Promise<PasswordResetAccepted> {
  return request<PasswordResetAccepted>("/auth/password/forgot", { method: "POST", body: JSON.stringify(input) })
}

/** POST /auth/password/reset —— 消费一次性重置令牌并换密，成功后需重新登录。 */
export function resetPassword(input: PasswordResetInput): Promise<void> {
  return request<void>("/auth/password/reset", { method: "POST", body: JSON.stringify(input) })
}

/** POST /auth/logout —— 服务端删除 Redis 会话 key 并清 Cookie */
export function logout(): Promise<void> {
  return request<void>("/auth/logout", { method: "POST" })
}

// ---------------------------------------------------------------------------
// Resume：CRUD / duplicate / archive / document / render / export
// ---------------------------------------------------------------------------

/** GET /resumes */
export function listResumes(params?: { lifecycle?: Resume["lifecycle"]; query?: string; tag?: string }): Promise<Resume[]> {
  const search = new URLSearchParams()
  if (params?.lifecycle) search.set("lifecycle", params.lifecycle)
  if (params?.query) search.set("query", params.query)
  if (params?.tag) search.set("tag", params.tag)
  const suffix = search.toString()
  return request<Resume[]>(`/resumes${suffix ? `?${suffix}` : ""}`)
}

/**
 * POST /resumes —— 完全新开空草稿：显式提交即授权（C-01）。
 * title / templateId 由调用方补默认值，文档留空，建好后再改。
 */
export function createResume(input: { title: string; templateId: string; targetRole?: string; tags?: string[]; profileId?: string }): Promise<Resume> {
  return request<Resume>("/resumes", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      templateId: input.templateId,
      targetRole: input.targetRole ?? "",
      tags: input.tags ?? [],
      profileId: input.profileId,
    }),
  })
}

/** POST /resumes/{id}/duplicate —— 复制整份文档；后端把标题改成「原标题（副本）」。 */
export function duplicateResume(id: string): Promise<Resume> {
  return request<Resume>(`/resumes/${id}/duplicate`, { method: "POST" })
}

/** GET /resumes/{id} */
export function getResume(id: string): Promise<Resume | undefined> {
  return request<Resume>(`/resumes/${id}`)
}

/** GET /resumes/{id}/versions */
export function listResumeVersions(id: string) {
  return request<ResumeVersion[]>(`/resumes/${id}/versions`)
}

/**
 * PUT /resumes/{id}/draft —— 把编辑草稿同步到服务端缓冲，**不生成版本**（C-05）。
 * 静默计时到期或显式保存时再 PUT /resumes/{id}/document 提交为 source=manual 版本。
 */
export function saveDraft(id: string, input: { document: ResumeDocument; baseVersionId: string }): Promise<Resume> {
  return request<Resume>(`/resumes/${id}/draft`, {
    method: "PUT",
    body: JSON.stringify({ document: input.document, baseVersionId: input.baseVersionId }),
  })
}

/**
 * PUT /resumes/{id}/document —— 手动结构化编辑落库。
 *
 * 提交整份文档 + 基线版本号：后端用 base_version_id 做乐观锁，基线过期返回 409 BASE_VERSION_STALE；
 * 文档与当前版本一致时后端不生成新版本、直接回当前 Resume。返回值是服务端权威状态（含 saveState 与新的 currentVersionId）。
 */
export function updateDocument(id: string, input: { document: ResumeDocument; baseVersionId: string; message?: string }): Promise<Resume> {
  return request<Resume>(`/resumes/${id}/document`, {
    method: "PUT",
    body: JSON.stringify({
      document: input.document,
      baseVersionId: input.baseVersionId,
      message: input.message,
    }),
  })
}

// ---------------------------------------------------------------------------
// Agent Run / Conversation：events / cancel / PendingAction approve|reject
// ---------------------------------------------------------------------------

export interface GetActiveRunOptions {
  /**
   * 是否把会话层对话合成进 `timeline`。默认 true；工作台摘要只需要待办数，
   * 传 false 避免为每份简历多拉一次会话消息。
   */
  withConversation?: boolean
}

/**
 * GET /resumes/{id}/turns → GET /turns/{turnId}/state → GET /sessions/{sessionId}/messages
 *
 * 用轮次列表而不是 working-document 发现轮次：approval 下 preview 只建待办、不落
 * working copy，只有轮次列表能在首次 apply 前发现待审批轮次。**优先 open，没有再取
 * 最新一轮**：轮次 finalize 后 active-run 不能立刻归空，否则用户刚发起的对话连同
 * Agent 回复、提出的修改会一起消失。完全没有轮次时返回 null：React Query v5 禁止
 * queryFn resolve 出 undefined，用 null 表达「查询成功但没有轮次」这一合法空值。
 *
 * 对话内容来自会话层（`turn.sessionId`）：`turn.message` 在标准 run 里为空，Agent
 * 的中间回复与最终回复只写在 `agent_session_messages`。会话不可读时退回轮次投影，
 * 不阻塞面板。预算来自轮次 checkpoint，该端点不可用时退化为 0。
 */
export async function getActiveRun(resumeId: string, options: GetActiveRunOptions = {}): Promise<AgentRun | null> {
  const turns = await request<ApiTurn[]>(`/resumes/${resumeId}/turns`)
  const turn = turns.find((item) => item.state === "open") ?? turns[0]
  if (!turn) return null
  const state = await request<TurnStateResponse>(`/turns/${turn.id}/state`).catch(() => undefined)
  const run = mapTurnToRun(turn, state)
  if (options.withConversation === false || !turn.sessionId) return run
  const messages = await listSessionMessages(turn.sessionId).catch(() => [] as AgentSessionMessage[])
  if (!messages.length) return run
  return { ...run, timeline: buildRunTimeline(messages, run.timeline) }
}

export interface StartRunInput {
  prompt: string
  executionMode?: ExecutionMode
}

export interface RunStartAccepted {
  runId: string
  status: string
}

/** POST /resumes/{resume_id}/runs —— 由后端 spawn 运行体；202 只表示已启动。 */
export function startRun(resumeId: string, input: StartRunInput): Promise<RunStartAccepted> {
  const body: { prompt: string; executionMode?: ExecutionMode } = { prompt: input.prompt }
  if (input.executionMode) body.executionMode = input.executionMode
  return request<RunStartAccepted>(`/resumes/${resumeId}/runs`, { method: "POST", body: JSON.stringify(body) })
}

// ---------------------------------------------------------------------------
// Agent 会话与 profile 作用域 run（契约 §19 / §21）
// ---------------------------------------------------------------------------

/**
 * POST /sessions —— 建会话；body 可省略。
 * 会话只绑 owner，一个会话可横跨多份简历与主档：scope 是轮次属性，不是会话属性。
 */
export function createSession(): Promise<AgentSession> {
  return request<AgentSession>("/sessions", { method: "POST", body: JSON.stringify({}) })
}

/** GET /sessions —— 当前用户的会话，最近活跃优先（last_active_at desc）。 */
export function listSessions(): Promise<AgentSession[]> {
  return request<AgentSession[]>("/sessions")
}

/**
 * GET /sessions/{id}/messages —— 会话历史。
 * afterSeq=N 只返回 seq > N，用于断线或收到 turn.updated 后的增量拉取；默认返回全部。
 */
export function listSessionMessages(sessionId: string, afterSeq = 0): Promise<AgentSessionMessage[]> {
  const suffix = afterSeq > 0 ? `?afterSeq=${afterSeq}` : ""
  return request<AgentSessionMessage[]>(`/sessions/${sessionId}/messages${suffix}`)
}

/**
 * POST /sessions/{id}/messages —— 追加消息，同一 (session_id, seq) 幂等。
 * seq 由调用方分配：运行体从会话当前最大 seq 之后继续写，不会覆盖历史。
 */
export function appendSessionMessage(sessionId: string, input: SessionMessageInput): Promise<AgentSessionMessage> {
  return request<AgentSessionMessage>(`/sessions/${sessionId}/messages`, { method: "POST", body: JSON.stringify(input) })
}

/**
 * GET /sessions/{id}/turns —— profile 作用域轮次，与 GET /resumes/{id}/turns 同构。
 * 返回 UserTurnResponse[]（含 pendingActions），创建时间倒序；无轮次返回 []。
 */
export function listSessionTurns(sessionId: string): Promise<ApiTurn[]> {
  return request<ApiTurn[]>(`/sessions/${sessionId}/turns`)
}

/**
 * POST /sessions/{id}/runs —— 起一次 profile 作用域 run；202 只表示已启动。
 * 与简历 run 一样不返回 turnId：轮次由子进程创建，前端用 GET turns 与 SSE 发现。
 */
export function startProfileRun(sessionId: string, prompt: string): Promise<RunStartAccepted> {
  return request<RunStartAccepted>(`/sessions/${sessionId}/runs`, { method: "POST", body: JSON.stringify({ prompt }) })
}

/** POST /pending-actions/{id}/approve */
export function approvePendingAction(actionId: string): Promise<PendingAction> {
  return request<PendingAction>(`/pending-actions/${actionId}/approve`, { method: "POST" })
}

/** POST /pending-actions/{id}/reject */
export function rejectPendingAction(actionId: string): Promise<PendingAction> {
  return request<PendingAction>(`/pending-actions/${actionId}/reject`, { method: "POST" })
}

/**
 * 把后端待办投影映射为界面 PendingAction。
 * profile 待办没有绑定简历，targetResource 为空串（PendingActionCard 按空串渲染）。
 */
export function mapPendingAction(action: ApiTurnPendingAction): PendingAction {
  return {
    id: action.id,
    kind: action.kind,
    title: action.title,
    targetResource: action.targetResource ?? "",
    baseVersionId: action.baseVersionId ?? undefined,
    impactSummary: action.impactSummary,
    requiresTextConfirm: action.requiresTextConfirm,
    state: action.state,
    staleReason: action.staleReason ?? undefined,
    diff: action.diff,
  }
}

/** 把后端轮次投影映射为界面 Run；状态只由真实轮次与待办状态推导，不虚构事件。 */
export function mapTurnToRun(turn: ApiTurn, state?: TurnStateResponse): AgentRun {
  const pendingActions = (turn.pendingActions ?? []).map(mapPendingAction)
  const hasPending = pendingActions.some((action) => action.state === "pending")
  const hasApproved = pendingActions.some((action) => action.state === "approved")
  const runState: AgentRun["state"] =
    turn.state === "open" ? (hasPending ? "awaiting_confirm" : hasApproved ? "approved" : "running") : "turn_closed"
  const budget = state?.runState?.budget ?? {}
  const timeline: RunTimelineEvent[] = []
  if (turn.message) {
    timeline.push({ id: `${turn.id}:message`, kind: "message", at: turn.createdAt ?? new Date().toISOString(), role: "user", text: turn.message })
  }
  if (turn.result?.message) {
    timeline.push({ id: `${turn.id}:result`, kind: "finalize", at: turn.closedAt ?? new Date().toISOString(), role: "agent", text: turn.result.message })
  }
  return {
    id: turn.id,
    // AgentRun 目前只服务简历工作台；profile 轮次不带简历，这里退化为空串。
    resumeId: turn.resumeId ?? "",
    conversationId: turn.sessionId ?? turn.id,
    userTurnId: turn.id,
    executionMode: turn.executionMode,
    modeSource: turn.modeSource,
    state: runState,
    budget: {
      usedTokens: budget.tokensUsed ?? 0,
      maxTokens: budget.maxTokens ?? 0,
      usedTurns: budget.turnsUsed ?? 0,
      maxTurns: budget.maxTurns ?? 0,
      costUsd: budget.costUsedUsd ?? 0,
    },
    timeline,
    pendingActions,
  }
}

// ---------------------------------------------------------------------------
// Profile：CRUD / facts / search / match-job / resume-drafts / versions
// ---------------------------------------------------------------------------

/** GET /profile */
export function getProfile(): Promise<Profile> {
  return request<Profile>("/profile")
}

/** POST /profile/match-job */
export function matchJob(jdId: string): Promise<{ results: JobMatchResult[]; gaps: MatchGap[] }> {
  return resolve(JOB_MATCHES[jdId] ?? { results: [], gaps: [] })
}

/**
 * POST /profile/facts —— 用户在表单中直接录入事实。
 * 与对话路径只在来源标记上不同；证据状态由表单决定，默认待核实（BR-D09）。
 */
export function createFactManually(input: ProfileFactInput): Promise<ProfileFact> {
  return request<ProfileFact>("/profile/facts", { method: "POST", body: JSON.stringify(input) })
}

/** PATCH /profile/facts/{id} —— 用户确认后更新事实（对话与直接编辑共用） */
export function updateFact(id: string, patch: Partial<ProfileFact>): Promise<ProfileFact> {
  return request<ProfileFact>(`/profile/facts/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

/** PATCH /profile/basics —— 用户确认后更新基本信息 */
export async function updateBasics(patch: Partial<ResumeBasics>): Promise<ResumeBasics> {
  const profile = await request<Profile>("/profile/basics", { method: "PATCH", body: JSON.stringify(patch) })
  return profile.basics
}

/** POST /jds:parse-text —— 把粘贴的岗位文本整理成结构化 JD 草案 */
export function parseJdFromText(text: string): Promise<ProposedJd> {
  return resolve(heuristicParseJd(text, "text"))
}

/**
 * POST /jds:parse-image —— 上传截图，OCR + 结构化。
 * 真实实现走图片识别；此处为前端演示，返回基于文件名的示例草案。
 */
export function parseJdFromImage(fileName: string): Promise<ProposedJd> {
  const demo =
    "高级前端工程师\n某科技有限公司\n职责：负责 C 端核心页面开发，主导性能优化；参与前端工程化与团队规范建设。\n要求：5 年以上经验，精通 React 与 TypeScript，有大型项目性能调优与团队带教经验。"
  const parsed = heuristicParseJd(demo, "image")
  parsed.note = i18n.t("api.jd.note.imageDemo", { fileName })
  return resolve(parsed)
}

/** POST /jds —— 用户确认后创建 JD */
export function createJd(input: ProposedJd): Promise<JobDescription> {
  return request<JobDescription>("/jds", {
    method: "POST",
    body: JSON.stringify({
      role: input.role,
      company: input.company,
      body: input.body,
      sourceUrl: input.sourceUrl,
      tags: input.tags,
    }),
  })
}

// —— 启发式 JD 结构化解析 ——
function heuristicParseJd(raw: string, inputSource: "text" | "image"): ProposedJd {
  const text = raw.trim()
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  const extracted: { label: string; value: string }[] = []

  const roleRe = /(前端|后端|全栈|算法|数据|产品|测试|运维|移动端|客户端)?[\u4e00-\u9fa5A-Za-z]*?(架构师|工程师|经理|设计师|总监|专家|开发)/
  let role = ""
  const roleLine = lines.find((l) => /(岗位|职位|title)/i.test(l) && roleRe.test(l)) || lines.find((l) => roleRe.test(l))
  if (roleLine) {
    const cleaned = roleLine.replace(/^.*?(岗位|职位|title)[：: ]*/i, "")
    role = (cleaned.match(roleRe)?.[0] || roleLine.match(roleRe)?.[0] || "").trim()
  }
  if (role) extracted.push({ label: i18n.t("api.jd.extracted.role"), value: role })

  let company: string | undefined
  const cm = text.match(/([\u4e00-\u9fa5A-Za-z]{2,20}?(?:集团|科技(?:有限)?公司|信息技术(?:有限)?公司|有限公司|公司))/)
  if (cm) company = cm[1]
  if (company) extracted.push({ label: i18n.t("api.jd.extracted.company"), value: company })

  const url = text.match(/https?:\/\/\S+/)
  const sourceUrl = url?.[0]
  if (sourceUrl) extracted.push({ label: i18n.t("api.jd.extracted.source"), value: sourceUrl })

  const tagRules: [string, RegExp][] = [
    [i18n.t("api.jd.tags.frontend"), /前端|react|vue|typescript|javascript/i],
    [i18n.t("api.jd.tags.backend"), /后端|java|golang|\bgo\b|python|node/i],
    [i18n.t("api.jd.tags.performance"), /性能|优化|调优|lcp|首屏|加载/i],
    [i18n.t("api.jd.tags.team"), /团队|带领|带教|管理|leader|负责人/i],
    [i18n.t("api.jd.tags.cEnd"), /c ?端|用户端|海量|高并发|交易链路/i],
    [i18n.t("api.jd.tags.architecture"), /架构|基础设施|中台|框架|工程化/i],
  ]
  const tags = tagRules.filter(([, re]) => re.test(text)).map(([t]) => t)

  const parseConfidence = Math.min(0.95, 0.5 + (role ? 0.2 : 0) + (company ? 0.15 : 0) + (tags.length ? 0.1 : 0))

  return {
    role,
    company,
    tags,
    body: text,
    sourceUrl,
    extracted,
    parseConfidence,
    note:
      inputSource === "image"
        ? i18n.t("api.jd.note.image")
        : i18n.t("api.jd.note.text"),
    inputSource,
  }
}

// ---------------------------------------------------------------------------
// JD：CRUD / search / detail / 软绑定 read|replace|release / 候选与微调
// ---------------------------------------------------------------------------

/** GET /jds */
export function listJds(params?: { query?: string; tag?: string }): Promise<JobDescription[]> {
  const search = new URLSearchParams()
  if (params?.query) search.set("query", params.query)
  if (params?.tag) search.set("tag", params.tag)
  const suffix = search.toString()
  return request<JobDescription[]>(`/jds${suffix ? `?${suffix}` : ""}`)
}

/** GET /jds/{id} */
export function getJd(id: string): Promise<JobDescription | undefined> {
  return request<JobDescription>(`/jds/${id}`)
}

// ---------------------------------------------------------------------------
// 配置：agent/config / models / settings
// ---------------------------------------------------------------------------

/** GET /agent/config */
export function getAgentConfig(): Promise<AgentConfig> {
  return request<AgentConfig>("/agent/config")
}

/** PATCH /agent/config */
export function updateAgentConfig(patch: AgentConfigUpdate): Promise<AgentConfig> {
  return request<AgentConfig>("/agent/config", { method: "PATCH", body: JSON.stringify(patch) })
}

/** GET /models/config */
export function getModelConfig(): Promise<ModelConfig> {
  return request<ModelConfig>("/models/config")
}

/**
 * GET /agent/runtime —— 运行体就绪探测（契约 §20.5）。
 * available=true 只表示后端能在需要时启动运行体，不代表已有常驻进程。
 */
export function getRuntimeStatus(): Promise<RuntimeStatus> {
  return request<RuntimeStatus>("/agent/runtime")
}

/**
 * GET /models/catalog —— 只读模型目录（契约 §17）；条目来自后端 models.dev 快照。
 * provider 按 provider id 过滤，q 按模型 id / 名称搜索。
 */
export function getModelCatalog(params?: { provider?: string; q?: string }): Promise<ModelCatalog> {
  const search = new URLSearchParams()
  if (params?.provider) search.set("provider", params.provider)
  if (params?.q) search.set("q", params.q)
  const suffix = search.toString()
  return request<ModelCatalog>(`/models/catalog${suffix ? `?${suffix}` : ""}`)
}

/** PUT /models/config —— apiKey 为 write-only，响应不回显 */
export function updateModelConfig(patch: ModelConfigUpdate): Promise<ModelConfig> {
  return request<ModelConfig>("/models/config", { method: "PUT", body: JSON.stringify(patch) })
}

/** POST /models/config:test —— 用给定配置发起连通性测试，缺省字段沿用已存配置；响应与错误均不含明文密钥 */
export function testModelConnection(patch: ModelConfigUpdate = {}): Promise<ModelTestResult> {
  return request<ModelTestResult>("/models/config:test", { method: "POST", body: JSON.stringify(patch) })
}

/** GET /settings */
export function getPreferences(): Promise<UserPreferences> {
  return request<UserPreferences>("/settings")
}

/** PATCH /settings */
export function updatePreferences(patch: UserPreferencesUpdate): Promise<UserPreferences> {
  return request<UserPreferences>("/settings", { method: "PATCH", body: JSON.stringify(patch) })
}

// ---------------------------------------------------------------------------
// 模板（C-08）
// ---------------------------------------------------------------------------

/** GET /templates */
export function listTemplates(): Promise<ResumeTemplate[]> {
  return request<ResumeTemplate[]>("/templates")
}

/** GET /templates/{id} */
export function getTemplate(id: string): Promise<ResumeTemplate | undefined> {
  return request<ResumeTemplate>(`/templates/${id}`)
}

// ---------------------------------------------------------------------------
// 开放接入：PAT / 访问日志 / 能力发现
// ---------------------------------------------------------------------------

/** GET /access/tokens */
export function listPats(): Promise<PersonalAccessToken[]> {
  return request<PersonalAccessToken[]>("/access/tokens")
}

/** POST /access/tokens —— 仅创建响应返回一次性 secretOnce */
export function createPat(input: PersonalAccessTokenInput): Promise<PersonalAccessToken> {
  return request<PersonalAccessToken>("/access/tokens", { method: "POST", body: JSON.stringify(input) })
}

/** POST /access/tokens/{id}/revoke */
export function revokePat(id: string): Promise<PersonalAccessToken> {
  return request<PersonalAccessToken>(`/access/tokens/${id}/revoke`, { method: "POST" })
}

/** GET /access/logs */
export function listAccessLogs(): Promise<AccessLogEntry[]> {
  return request<AccessLogEntry[]>("/access/logs")
}

/** GET /.well-known/resume-agent */
export function getCapability(): Promise<CapabilityDiscovery> {
  return request<CapabilityDiscovery>("/.well-known/resume-agent")
}

// ---------------------------------------------------------------------------
// RBAC 管理：角色可维护（role:write）；权限目录只读
// ---------------------------------------------------------------------------

/** GET /auth/roles */
export function listRoles(): Promise<Role[]> {
  return request<Role[]>("/auth/roles")
}

/** POST /auth/roles */
export function createRole(input: RoleInput): Promise<Role> {
  return request<Role>("/auth/roles", { method: "POST", body: JSON.stringify(input) })
}

/** PATCH /auth/roles/{id} */
export function updateRole(id: string, patch: RoleUpdateInput): Promise<Role> {
  return request<Role>(`/auth/roles/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
}

/** DELETE /auth/roles/{id} */
export function deleteRole(id: string): Promise<void> {
  return request<void>(`/auth/roles/${id}`, { method: "DELETE" })
}

/** GET /auth/permissions —— 只读权限目录，权限码由代码声明 */
export function listPermissions(): Promise<Permission[]> {
  return request<Permission[]>("/auth/permissions")
}

// ---------------------------------------------------------------------------
// 备份迁移：export / markdown / import 预览 / import
// ---------------------------------------------------------------------------

/** GET /backup/export */
export function exportBackup(): Promise<BackupPayload> {
  return request<BackupPayload>("/backup/export")
}

/** GET /backup/export/markdown */
export function exportBackupMarkdown(): Promise<string> {
  return requestText("/backup/export/markdown")
}

/** POST /backup/import:preview */
export function previewImport(payload: BackupPayload): Promise<ImportPreview> {
  return request<ImportPreview>("/backup/import:preview", { method: "POST", body: JSON.stringify(payload) })
}

/** POST /backup/import */
export function importBackup(payload: BackupPayload): Promise<ImportResult> {
  return request<ImportResult>("/backup/import", { method: "POST", body: JSON.stringify(payload) })
}

// ---------------------------------------------------------------------------
// 工作台聚合（SCR-001）
// ---------------------------------------------------------------------------

/** GET /workbench/summary —— 由多个资源聚合出的首页摘要 */
export async function getWorkbenchSummary(): Promise<WorkbenchSummary> {
  const resumes = await listResumes()
  const jds = await listJds()
  const profile = await getProfile()
  // 没有「列出活动轮次」的端点：逐份简历查询最新轮次，累加真实待办数。
  // 摘要不需要对话正文，跳过会话消息拉取。
  const runs = await Promise.all(resumes.map((resume) => getActiveRun(resume.id, { withConversation: false })))
  const pendingActionCount = runs.reduce((n, run) => n + (run?.pendingActions.filter((p) => p.state === "pending").length ?? 0), 0)
  return resolve({
    latestResume: resumes[0],
    uncommittedDraftCount: resumes.filter((r) => r.saveState === "uncommitted" || r.saveState === "synced_draft").length,
    pendingActionCount,
    conflictCount: 0,
    frozenDraftCount: 0,
    latestJd: jds[0],
    profileCompleteness: profile.completeness,
    unverifiedFactCount: profile.facts.filter((f) => f.evidence.status !== "verified").length,
    hasProfile: true,
    jobStage: [
      { label: "workbench.stage.establish", done: true },
      { label: "workbench.stage.generate", done: true },
      { label: "workbench.stage.tune", done: false },
      { label: "workbench.stage.export", done: false },
    ],
  })
}

export { CURRENT_USER }
