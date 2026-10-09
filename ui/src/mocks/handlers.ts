// Storybook 与 Vitest 共用的 MSW handlers：已对接端点由后端契约驱动，fixtures 来自 content.ts。
import { http, HttpResponse } from "msw"
import {
  ACCESS_LOGS,
  AGENT_CONFIG,
  CAPABILITY,
  IMPORT_PREVIEW_SAMPLE,
  JDS,
  MODEL_CATALOG,
  MODEL_CONFIG,
  PATS,
  PROFILE,
  RESUMES,
  TEMPLATES,
  USER_PREFERENCES,
} from "@/lib/content"
import type { AgentSession, AuthUser, Permission, ProfileFact, Resume, Role } from "@/lib/types"

const AUTH_USER: AuthUser = {
  id: "user_test",
  email: "test@resumate.dev",
  displayName: "测试用户",
  role: "super_admin",
  roles: ["super_admin"],
  permissions: ["account:read", "account:write", "access:read", "access:write", "user:read", "role:read"],
  isBanned: false,
  createdAt: "2026-01-01T00:00:00+08:00",
}

const AUTH_ACCOUNTS: Record<string, string> = { "test@resumate.dev": "password123" }

// d7b99 契约：未验证邮箱登录被拒；验证令牌由 verify 端点消费。
const UNVERIFIED_EMAIL = "unverified@resumate.dev"
const VERIFICATION_TOKEN = "valid-token"
// b5586：忘记密码与重置密码的一次性令牌。
const PASSWORD_RESET_TOKEN = "valid-reset-token"

const RBAC_ROLES: Role[] = [
  { id: "role_user", code: "user", name: "普通用户", description: "", rank: 1, isSystem: true, permissions: ["resume:read"] },
  { id: "role_super_admin", code: "super_admin", name: "超级管理员", description: "", rank: 3, isSystem: true, permissions: ["resume:read", "resume:write", "role:write"] },
]

const RBAC_PERMISSIONS: Permission[] = [
  { id: "perm_resume_read", code: "resume:read", group: "resume", name: "读取简历" },
  { id: "perm_resume_write", code: "resume:write", group: "resume", name: "编辑简历" },
  { id: "perm_role_write", code: "role:write", group: "role", name: "维护角色" },
]

// 55e99：真实 Agent Run 端点的 mock 状态。res_fe_lead 上挂一个带待办的活跃轮次。
const MOCK_PENDING_ACTION = {
  id: "pa_now",
  userTurnId: "turn_now",
  kind: "content_patch",
  title: "强化性能优化量化成果",
  targetResource: "高级前端工程师简历 · 职业经历",
  baseVersionId: "ver_fe_5",
  impactSummary: "修改 1 条经历要点，新增 1 条量化描述；不影响其它章节。",
  requiresTextConfirm: false,
  state: "pending",
  staleReason: null,
  diff: [
    {
      id: "d_now_1",
      target: "职业经历 · 第 1 条",
      changeType: "modified",
      before: "主导商详页重构。",
      after: "主导商详页重构（团队 5 人），首屏 LCP 3.2s 降至 1.4s。",
      reason: "JD 强调规模化收益与团队协作。",
      state: "pending",
    },
  ],
  createdAt: "2026-09-20T14:30:12+08:00",
  decidedAt: null,
}

const MOCK_TURN = {
  id: "turn_now",
  resumeId: "res_fe_lead",
  clientId: "external",
  source: "agent",
  executionMode: "approval",
  modeSource: "session",
  state: "open",
  baseVersionId: "ver_fe_5",
  sessionId: "sess_now",
  message: "帮我根据美团这份 JD 突出性能优化经历。",
  createdAt: "2026-09-20T14:30:00+08:00",
  closedAt: null,
  result: null,
  pendingActions: [MOCK_PENDING_ACTION],
}

// 会话层对话（契约 §19.1 / §21.5）：标准 run 的 prompt、中间回复与最终回复都在这里，
// 前端 run-panel 从 GET /sessions/{id}/messages 合成时间线。
const MOCK_SESSION_MESSAGES = [
  {
    id: "msg_now_1",
    sessionId: "sess_now",
    seq: 1,
    role: "system",
    content: { role: "system", content: "You operate a Resumate resume through the public API." },
    createdAt: "2026-09-20T14:30:00+08:00",
  },
  {
    id: "msg_now_2",
    sessionId: "sess_now",
    seq: 2,
    role: "user",
    content: { role: "user", content: "帮我根据美团这份 JD 突出性能优化经历。" },
    createdAt: "2026-09-20T14:30:01+08:00",
  },
  {
    id: "msg_now_3",
    sessionId: "sess_now",
    seq: 3,
    role: "assistant",
    content: {
      role: "assistant",
      content: "先读工作副本，确认当前经历的写法。",
      toolCalls: [{ id: "call_now_1", name: "get_working_document", arguments: { resume_id: "res_fe_lead" } }],
    },
    createdAt: "2026-09-20T14:30:02+08:00",
  },
  {
    id: "msg_now_4",
    sessionId: "sess_now",
    seq: 4,
    role: "assistant",
    content: { text: "已生成一条待确认的量化改写，批准后即可提交。" },
    createdAt: "2026-09-20T14:30:03+08:00",
  },
]

function createSession(id: string): AgentSession {
  const now = new Date().toISOString()
  return { id: `sess_${id}`, createdAt: now, updatedAt: now, lastActiveAt: now }
}

function unauthorized(code: string, message: string) {
  return HttpResponse.json({ code, message }, { status: 401 })
}

function notFound(message: string) {
  return HttpResponse.json({ code: "RESOURCE_NOT_FOUND", message }, { status: 404 })
}

function createFact(body: Partial<ProfileFact>): ProfileFact {
  const status = body.evidence?.status ?? "unverified"
  const verified = status === "verified"
  return {
    id: `fact_mock_${Date.now().toString(36)}`,
    type: body.type ?? "experience",
    title: body.title ?? "未命名事实",
    content: body.content ?? "",
    tags: body.tags ?? [],
    source: "手动录入",
    evidence: { status },
    confidence: verified ? 0.9 : 0.5,
    verifiedAt: verified ? new Date().toISOString() : undefined,
    visibility: body.visibility ?? "private",
    referencedBy: [],
  }
}

// e1a80：归档 / 恢复只改元数据。用一层覆盖表模拟后端持久化，
// 让 Storybook 里点「归档」后卡片真的换 Tab（Vitest 断言请求时用 server.use 覆盖）。
const LIFECYCLE_OVERRIDES = new Map<string, Resume["lifecycle"]>()

function withLifecycle(resume: Resume): Resume {
  const lifecycle = LIFECYCLE_OVERRIDES.get(resume.id)
  return lifecycle ? { ...resume, lifecycle } : resume
}

// A11 题库 / 笔试的默认桩：形状对齐真实契约，让未覆盖的 story 也能离线渲染。
const MOCK_BANK_QUESTIONS = [
  {
    id: "bkq_mock_nacos",
    role: "Java 后端",
    kind: "technical",
    difficulty: "medium",
    prompt: "在 Nacos 作为注册中心时，临时实例与持久实例在健康检查和剔除机制上有什么区别？",
    referencePoints: ["临时实例由客户端心跳维持", "持久实例由服务端主动健康检查"],
    knowledgeRefs: ["Nacos 服务注册与健康检查 · 临时实例与持久实例"],
    source: "seed_model",
    createdAt: "2026-10-09T08:00:00+08:00",
  },
  {
    id: "bkq_mock_sharding",
    role: "Java 后端",
    kind: "deep_dive",
    difficulty: "hard",
    prompt: "订单表单表 3000 万行、日增 80 万行，请说明你会采集哪些指标判断是否必须分库分表。",
    referencePoints: ["采集行数、日均增量、P99 与磁盘增速", "分片数取 2 的幂便于翻倍扩容"],
    knowledgeRefs: ["分库分表实战 · 分片键与路由算法"],
    source: "seed_model",
    createdAt: "2026-10-09T08:00:00+08:00",
  },
  {
    id: "bkq_mock_ratelimit",
    role: "Java 后端",
    kind: "scenario",
    difficulty: "medium",
    prompt: "大促零点网关 QPS 从 1 万突增到 8 万，请说明你会如何做限流并给出关键配置项。",
    referencePoints: ["用 Redis + Lua 令牌桶做网关全局限流", "超限返回 429 并带 Retry-After"],
    knowledgeRefs: ["Spring Cloud Gateway 限流与灰度路由 · 限流：令牌桶与 KeyResolver"],
    source: "seed_model",
    createdAt: "2026-10-09T08:00:00+08:00",
  },
]

const MOCK_QUIZ_ATTEMPT = {
  id: "qza_mock",
  status: "in_progress",
  role: "Java 后端",
  questionTypes: ["objective", "open", "code"],
  questions: [
    {
      id: "qzq_mock_objective",
      group: "objective",
      kind: "multiple_choice",
      ordinal: 1,
      points: 10,
      prompt: "关于订单服务分库分表的容量评估，下列说法正确的有哪些？",
      options: [
        { id: "a", text: "分片键选订单号，保证同一订单的读写落在同一分片。" },
        { id: "b", text: "分片数量一旦确定，后期就不需要再调整。" },
        { id: "c", text: "容量评估要同时考虑峰值 QPS、单行大小与索引膨胀系数。" },
        { id: "d", text: "跨分片聚合查询应尽量下沉到离线数仓。" },
      ],
      referencePoints: [],
      referenceAnswer: "",
      starterCode: "",
      source: { kind: "seed", label: "内置示范题", version: "seed-v1" },
    },
    {
      id: "qzq_mock_open",
      group: "open",
      kind: "open",
      ordinal: 2,
      points: 20,
      prompt: "大促当天订单量突增十倍，数据库连接数逼近上限。请给出排查顺序与保护方案。",
      options: [],
      referencePoints: ["先看连接池与慢查询", "再谈限流降级与扩容"],
      referenceAnswer: "先定位慢查询与连接泄漏，再对非核心链路限流降级，最后评估扩容与读写分离。",
      starterCode: "",
      source: { kind: "bank", label: "岗位题库", version: "bank-v1" },
    },
    {
      id: "qzq_mock_code",
      group: "code",
      kind: "code",
      ordinal: 3,
      points: 20,
      prompt: "实现一个线程安全的限流器，限制每秒最多 N 次请求。",
      options: [],
      referencePoints: [],
      referenceAnswer: "",
      starterCode: "public class RateLimiter {\n    // TODO\n}",
      source: { kind: "seed", label: "内置示范题", version: "seed-v1" },
    },
  ],
  answers: [],
  result: null,
  maxScore: 50,
  createdAt: "2026-10-09T08:00:00+08:00",
  updatedAt: "2026-10-09T08:00:00+08:00",
  submittedAt: null,
}

const MOCK_SPEECH_SEGMENT = {
  id: "spseg_mock",
  sessionId: "ivs_mock",
  questionId: "ivq_mock_1",
  durationSeconds: 8.4,
  transcript: "交易下单接口的 P99 从 800ms 降到 220ms，QPS 从 600 提到 1800。",
  charCount: 32,
  paceCharsPerMin: 229,
  fillerCount: 1,
  pauseCount: 1,
  clarityScore: 92,
  clarityLevel: "good",
  provider: "dashscope",
  timingSource: "timestamps",
  speechDurationSeconds: 8.4,
  createdAt: "2026-10-09T08:00:00+08:00",
}

const MOCK_PRACTICE_ITEMS = [
  {
    id: "pti_mock_rigor",
    role: "Java 后端",
    dimension: "rigor",
    goal: "补充分片键基因法和全局索引设计，说明如何覆盖多查询维度",
    material: "分片键选择未讨论卖家 / 订单号等查询维度和热点买家问题",
    status: "active",
    sourceReportId: "ivr_mock_1",
    sourceSessionId: "ivs_mock_1",
    rubricVersion: "interview-rubric-v1",
    retestSessionId: null,
    createdAt: "2026-10-09T08:00:00+08:00",
    updatedAt: "2026-10-09T08:00:00+08:00",
  },
  {
    id: "pti_mock_depth",
    role: "Java 后端",
    dimension: "depth",
    goal: "扩容说明虚拟槽位 / 双写开关 / 回滚方案，并给出迁移校验指标",
    material: "扩容方案未说明双写一致性、回滚和迁移校验细节",
    status: "active",
    sourceReportId: "ivr_mock_1",
    sourceSessionId: "ivs_mock_1",
    rubricVersion: "interview-rubric-v1",
    retestSessionId: null,
    createdAt: "2026-10-09T08:00:00+08:00",
    updatedAt: "2026-10-09T08:00:00+08:00",
  },
]

export const handlers = [
  http.get("/api/auth/me", () => HttpResponse.json(AUTH_USER)),
  http.post("/api/auth/login", async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string }
    if (body.email === UNVERIFIED_EMAIL) return HttpResponse.json({ code: "EMAIL_NOT_VERIFIED", message: "邮箱还未验证" }, { status: 403 })
    const expected = AUTH_ACCOUNTS[body.email]
    if (!expected || expected !== body.password) return unauthorized("INVALID_CREDENTIALS", "邮箱或密码不正确")
    return HttpResponse.json(AUTH_USER)
  }),
  // 注册改为邮箱验证（d7b99）：202 + 中性响应体，不下发会话 Cookie。
  http.post("/api/auth/register", async ({ request }) => {
    const body = (await request.json()) as { email: string }
    return HttpResponse.json({ status: "verification_sent", email: body.email }, { status: 202 })
  }),
  // 重发支持 email（注册成功页）或 token（失效链接页）二选一（d7b99）。
  http.post("/api/auth/verification/resend", async ({ request }) => {
    const body = (await request.json()) as { email?: string; token?: string }
    return HttpResponse.json({ status: "verification_sent", email: body.email ?? AUTH_USER.email }, { status: 202 })
  }),
  http.post("/api/auth/verification/verify", async ({ request }) => {
    const body = (await request.json()) as { token: string }
    if (body.token !== VERIFICATION_TOKEN) {
      return HttpResponse.json({ code: "VERIFICATION_TOKEN_INVALID", message: "验证链接无效" }, { status: 400 })
    }
    return HttpResponse.json(AUTH_USER, { headers: { "Set-Cookie": "resumate_session=mock; HttpOnly; Path=/" } })
  }),
  // 忘记密码（b5586）：forgot 始终 202 中性，命中账号才发信；reset 消费一次性令牌。
  http.post("/api/auth/password/forgot", async ({ request }) => {
    const body = (await request.json()) as { email: string }
    return HttpResponse.json({ status: "reset_sent", email: body.email }, { status: 202 })
  }),
  http.post("/api/auth/password/reset", async ({ request }) => {
    const body = (await request.json()) as { token: string; newPassword: string }
    if (body.token !== PASSWORD_RESET_TOKEN) {
      return HttpResponse.json({ code: "PASSWORD_RESET_TOKEN_INVALID", message: "reset link invalid" }, { status: 400 })
    }
    return new HttpResponse(null, { status: 204 })
  }),
  http.post("/api/auth/logout", () => new HttpResponse(null, { status: 204 })),
  http.get("/api/auth/roles", () => HttpResponse.json(RBAC_ROLES)),
  http.post("/api/auth/roles", async ({ request }) => {
    const body = (await request.json()) as Partial<Role>
    return HttpResponse.json({ ...RBAC_ROLES[0], id: "role_mock_new", isSystem: false, ...body }, { status: 201 })
  }),
  http.patch("/api/auth/roles/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<Role>
    const base = RBAC_ROLES.find((item) => item.id === params.id) ?? RBAC_ROLES[0]
    return HttpResponse.json({ ...base, ...body })
  }),
  http.delete("/api/auth/roles/:id", () => new HttpResponse(null, { status: 204 })),
  http.get("/api/auth/permissions", () => HttpResponse.json(RBAC_PERMISSIONS)),
  http.get("/api/profile", () => HttpResponse.json(PROFILE)),
  http.patch("/api/profile/basics", async ({ request }) => {
    const patch = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...PROFILE, basics: { ...PROFILE.basics, ...patch } })
  }),
  http.post("/api/profile/facts", async ({ request }) => {
    const body = (await request.json()) as Partial<ProfileFact>
    return HttpResponse.json(createFact(body), { status: 201 })
  }),
  http.patch("/api/profile/facts/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<ProfileFact>
    const base = PROFILE.facts.find((fact) => fact.id === params.id)
    if (!base) return notFound(`事实 ${params.id} 不存在`)
    return HttpResponse.json({ ...base, ...body })
  }),
  http.get("/api/resumes", ({ request }) => {
    const url = new URL(request.url)
    const lifecycle = url.searchParams.get("lifecycle")
    const query = url.searchParams.get("query")
    const tag = url.searchParams.get("tag")
    let items = RESUMES.map(withLifecycle).filter((resume) => resume.lifecycle !== "deleted")
    if (lifecycle) items = items.filter((resume) => resume.lifecycle === lifecycle)
    if (query) items = items.filter((resume) => resume.title.includes(query) || resume.targetRole.includes(query))
    if (tag) items = items.filter((resume) => resume.tags.includes(tag))
    return HttpResponse.json(items)
  }),
  http.get("/api/resumes/:id", ({ params }) => {
    const resume = RESUMES.map(withLifecycle).find((item) => item.id === params.id)
    return resume ? HttpResponse.json(resume) : notFound(`简历 ${params.id} 不存在`)
  }),
  // e1a80：归档 / 恢复端点接线（POST /resumes/{id}/archive、POST /resumes/{id}/restore）。
  http.post("/api/resumes/:id/archive", ({ params }) => {
    const resume = RESUMES.find((item) => item.id === params.id)
    if (!resume) return notFound(`简历 ${params.id} 不存在`)
    LIFECYCLE_OVERRIDES.set(resume.id, "archived")
    return HttpResponse.json(withLifecycle(resume))
  }),
  http.post("/api/resumes/:id/restore", ({ params }) => {
    const resume = RESUMES.find((item) => item.id === params.id)
    if (!resume) return notFound(`简历 ${params.id} 不存在`)
    LIFECYCLE_OVERRIDES.set(resume.id, "active")
    return HttpResponse.json(withLifecycle(resume))
  }),
  http.get("/api/resumes/:id/versions", ({ params }) => {
    const resume = RESUMES.find((item) => item.id === params.id)
    return resume ? HttpResponse.json(resume.versions) : notFound(`简历 ${params.id} 不存在`)
  }),
  // 草稿缓冲（C-05）：只同步文档，不生成版本；状态停在 synced_draft。
  http.put("/api/resumes/:id/draft", async ({ params, request }) => {
    const resume = RESUMES.find((item) => item.id === params.id)
    if (!resume) return notFound(`简历 ${params.id} 不存在`)
    const body = (await request.json()) as { document: typeof resume.document; baseVersionId?: string }
    if (body.baseVersionId && body.baseVersionId !== resume.currentVersionId) {
      return HttpResponse.json(
        { code: "BASE_VERSION_STALE", message: "简历内容已更新，请基于最新版本重试", latestVersionId: resume.currentVersionId },
        { status: 409 },
      )
    }
    return HttpResponse.json({ ...resume, document: body.document, saveState: "synced_draft" })
  }),
  // 手动编辑落库：镜像后端 PUT /resumes/{id}/document 的乐观锁行为。
  http.put("/api/resumes/:id/document", async ({ params, request }) => {
    const resume = RESUMES.find((item) => item.id === params.id)
    if (!resume) return notFound(`简历 ${params.id} 不存在`)
    const body = (await request.json()) as { document: typeof resume.document; baseVersionId?: string }
    if (body.baseVersionId && body.baseVersionId !== resume.currentVersionId) {
      return HttpResponse.json(
        { code: "BASE_VERSION_STALE", message: "简历内容已更新，请基于最新版本重试", latestVersionId: resume.currentVersionId },
        { status: 409 },
      )
    }
    return HttpResponse.json({ ...resume, document: body.document, saveState: "committed" })
  }),
  http.get("/api/jds", ({ request }) => {
    const url = new URL(request.url)
    const query = url.searchParams.get("query")
    const tag = url.searchParams.get("tag")
    let items = [...JDS]
    if (query) items = items.filter((jd) => jd.role.includes(query) || (jd.company ?? "").includes(query))
    if (tag) items = items.filter((jd) => jd.tags.includes(tag))
    return HttpResponse.json(items)
  }),
  http.get("/api/jds/:id", ({ params }) => {
    const jd = JDS.find((item) => item.id === params.id)
    return jd ? HttpResponse.json(jd) : notFound(`岗位 ${params.id} 不存在`)
  }),
  http.post("/api/jds", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const now = new Date().toISOString()
    return HttpResponse.json(
      {
        id: `jd_mock_${Date.now().toString(36)}`,
        ownerId: PROFILE.ownerId,
        role: body.role,
        company: body.company,
        body: body.body,
        sourceUrl: body.sourceUrl,
        tags: body.tags ?? [],
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
      { status: 201 },
    )
  }),
  http.get("/api/templates", () => HttpResponse.json(TEMPLATES)),
  http.get("/api/templates/:id", ({ params }) => {
    const template = TEMPLATES.find((item) => item.id === params.id)
    return template ? HttpResponse.json(template) : notFound(`模板 ${params.id} 不存在`)
  }),
  http.get("/api/settings", () => HttpResponse.json(USER_PREFERENCES)),
  http.patch("/api/settings", async ({ request }) => {
    const patch = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...USER_PREFERENCES, ...patch })
  }),
  http.get("/api/agent/config", () => HttpResponse.json(AGENT_CONFIG)),
  http.get("/api/agent/runtime", () => HttpResponse.json({ command: "resumate-agent", available: true })),
  http.patch("/api/agent/config", async ({ request }) => {
    const patch = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ ...AGENT_CONFIG, ...patch })
  }),
  http.get("/api/models/catalog", ({ request }) => {
    const url = new URL(request.url)
    const provider = url.searchParams.get("provider")
    const query = url.searchParams.get("q")?.trim().toLowerCase()
    let providers = MODEL_CATALOG.providers.map((item) => ({ ...item, models: [...item.models] }))
    if (provider) providers = providers.filter((item) => item.id === provider)
    if (query) {
      providers = providers
        .map((item) => ({
          ...item,
          models: item.models.filter((model) => model.id.toLowerCase().includes(query) || model.label.toLowerCase().includes(query)),
        }))
        .filter((item) => item.models.length > 0)
    }
    return HttpResponse.json({ ...MODEL_CATALOG, providers })
  }),
  http.get("/api/models/config", () => HttpResponse.json(MODEL_CONFIG)),
  http.put("/api/models/config", async ({ request }) => {
    const patch = (await request.json()) as Record<string, unknown>
    const { apiKey, ...rest } = patch
    const keyConfigured = typeof apiKey === "string" ? apiKey.length > 0 : MODEL_CONFIG.keyConfigured
    return HttpResponse.json({ ...MODEL_CONFIG, ...rest, keyConfigured })
  }),
  http.post(/\/api\/models\/config:test$/, () =>
    HttpResponse.json({ at: new Date().toISOString(), ok: true, message: "连接成功（HTTP 200）" }),
  ),
  http.get("/api/access/tokens", () => HttpResponse.json(PATS)),
  http.post("/api/access/tokens", async ({ request }) => {
    const body = (await request.json()) as { name?: string; scopes?: string[] }
    return HttpResponse.json(
      { ...PATS[0], id: "pat_mock_created", name: body.name ?? "Token", scopes: body.scopes ?? [], secretOnce: "rsm_pat_mock_secret_once" },
      { status: 201 },
    )
  }),
  http.post("/api/access/tokens/:id/revoke", ({ params }) => {
    const base = PATS.find((item) => item.id === params.id) ?? PATS[0]
    return HttpResponse.json({ ...base, status: "revoked" })
  }),
  http.get("/api/access/logs", ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get("page") ?? "1")
    const size = Number(url.searchParams.get("size") ?? "20")
    const purpose = url.searchParams.get("purpose")
    const result = url.searchParams.get("result")
    const query = url.searchParams.get("q")
    let rows = ACCESS_LOGS
    if (purpose) rows = rows.filter((row) => row.purpose === purpose)
    if (result) rows = rows.filter((row) => row.result === result)
    if (query) {
      const needle = query.toLowerCase()
      rows = rows.filter((row) => [row.clientId, row.scope, row.resource].some((value) => value.toLowerCase().includes(needle)))
    }
    const start = (page - 1) * size
    return HttpResponse.json(rows.slice(start, start + size), { headers: { "X-Total-Count": String(rows.length) } })
  }),
  http.get("/api/.well-known/resume-agent", () => HttpResponse.json(CAPABILITY)),
  http.get("/api/backup/export", () =>
    HttpResponse.json({
      formatVersion: "resumate-backup/1.0",
      exportedAt: new Date().toISOString(),
      ownerId: PROFILE.ownerId,
      resources: { profiles: [], resumes: [], resumeVersions: [], jobDescriptions: [] },
    }),
  ),
  http.get("/api/backup/export/markdown", () => HttpResponse.text("# Resumate backup index")),
  http.post(/\/api\/backup\/import:preview$/, () => HttpResponse.json(IMPORT_PREVIEW_SAMPLE)),
  http.post("/api/backup/import", () =>
    HttpResponse.json({
      imported: { resumes: 1, versions: 2, profiles: 1, facts: 1, jds: 1 },
      idMappings: IMPORT_PREVIEW_SAMPLE.idMappings,
      bindingRestores: IMPORT_PREVIEW_SAMPLE.bindingRestores,
    }),
  ),
  // Agent Run：GET /resumes/:id/turns?state=open 提供活跃轮次（preview-only 也能发现）。
  http.get("/api/resumes/:id/turns", ({ params, request }) => {
    const state = new URL(request.url).searchParams.get("state")
    if (state && state !== "open") return HttpResponse.json([])
    return HttpResponse.json(params.id === "res_fe_lead" ? [MOCK_TURN] : [])
  }),
  http.get("/api/resumes/:id/working-document", ({ params }) => {
    if (params.id === "res_fe_lead") {
      return HttpResponse.json({
        resumeId: "res_fe_lead",
        document: {},
        baseVersionId: "ver_fe_5",
        userTurnId: "turn_now",
        workingRevision: 1,
        dirty: true,
      })
    }
    return HttpResponse.json({
      resumeId: params.id,
      document: {},
      baseVersionId: null,
      userTurnId: null,
      workingRevision: 0,
      dirty: false,
    })
  }),
  http.get("/api/turns/:id", ({ params }) => {
    if (params.id !== "turn_now") return notFound(`轮次 ${params.id} 不存在`)
    return HttpResponse.json(MOCK_TURN)
  }),
  http.get("/api/turns/:id/state", ({ params }) =>
    HttpResponse.json({
      turnId: params.id,
      runState: { budget: { turnsUsed: 2, tokensUsed: 4200, costUsedUsd: 0.03, maxTurns: 8, maxTokens: 20000, maxCostUsd: 0.5 } },
      stateVersion: 1,
    }),
  ),
  http.post("/api/resumes/:id/runs", () =>
    HttpResponse.json({ runId: "run_mock", status: "started" }, { status: 202 }),
  ),
  // 会话层与 profile 作用域 run（契约 §19 / §21）：默认空会话，测试按需覆盖。
  http.get("/api/sessions", () => HttpResponse.json([])),
  http.post("/api/sessions", () => HttpResponse.json(createSession(Date.now().toString(36)), { status: 201 })),
  http.get("/api/sessions/:id/messages", ({ params }) =>
    HttpResponse.json(params.id === "sess_now" ? MOCK_SESSION_MESSAGES : []),
  ),
  http.post("/api/sessions/:id/messages", async ({ params, request }) => {
    const body = (await request.json()) as { seq: number; role: string; content: unknown }
    return HttpResponse.json(
      { id: `msg_${params.id}_${body.seq}`, sessionId: params.id, seq: body.seq, role: body.role, content: body.content, createdAt: new Date().toISOString() },
      { status: 201 },
    )
  }),
  http.get("/api/sessions/:id/turns", () => HttpResponse.json([])),
  http.post("/api/sessions/:id/runs", () =>
    HttpResponse.json({ runId: "run_mock_profile", status: "started" }, { status: 202 }),
  ),
  http.post("/api/pending-actions/:id/approve", ({ params }) =>
    HttpResponse.json({ ...MOCK_PENDING_ACTION, id: params.id, state: "approved" }),
  ),
  http.post("/api/pending-actions/:id/reject", ({ params }) =>
    HttpResponse.json({ ...MOCK_PENDING_ACTION, id: params.id, state: "rejected" }),
  ),
  // acf2f：知识库检索默认无内容 → no_match；Storybook 与测试用 use() 覆盖成命中。
  http.get("/api/kb/search", ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json({
      query: url.searchParams.get("q") ?? "",
      role: url.searchParams.get("role"),
      status: "no_match",
      total: 0,
      results: [],
    })
  }),
  // A11：题库 / 练习计划 / 笔试的默认桩，形状对齐真实契约；具体 story 与测试仍可用 use() 覆盖。
  http.get("/api/bank/stats", () =>
    HttpResponse.json({
      roles: [
        { role: "Java 后端", total: 100, kinds: { technical: 48, deep_dive: 24, scenario: 16, behavioral: 12 } },
        { role: "Web 前端", total: 100, kinds: { technical: 48, deep_dive: 24, scenario: 16, behavioral: 12 } },
      ],
      total: 200,
    }),
  ),
  http.get("/api/bank/questions", () =>
    HttpResponse.json(MOCK_BANK_QUESTIONS, { headers: { "X-Total-Count": String(MOCK_BANK_QUESTIONS.length) } }),
  ),
  http.get("/api/interview/practice-items", ({ request }) => {
    const role = new URL(request.url).searchParams.get("role") ?? "Java 后端"
    return HttpResponse.json(MOCK_PRACTICE_ITEMS.filter((item) => item.role === role))
  }),
  http.post("/api/quiz/attempts", () => HttpResponse.json(MOCK_QUIZ_ATTEMPT, { status: 201 })),
  http.get("/api/quiz/attempts/:id", () => HttpResponse.json(MOCK_QUIZ_ATTEMPT)),
  http.post("/api/quiz/attempts/:id/answers", () =>
    HttpResponse.json({
      answer: {
        id: "qza_mock_answer",
        questionId: "qzq_mock_objective",
        questionGroup: "objective",
        questionKind: "multiple_choice",
        selectedOptionIds: ["a"],
        textAnswer: null,
        codeAnswer: null,
        awardedPoints: 5,
        maxPoints: 10,
        verdict: "partial",
        executed: null,
        feedback: { policy: "多选：所选是无错选的正确子集（且非空）得半分（向下取整）。", optionAnalysis: [] },
        createdAt: "2026-10-09T08:00:00+08:00",
        gradedAt: "2026-10-09T08:00:00+08:00",
      },
    }),
  ),
  http.post("/api/quiz/attempts/:id/submit", () =>
    HttpResponse.json({
      ...MOCK_QUIZ_ATTEMPT,
      status: "submitted",
      result: { totalScore: 5, maxScore: 50, policy: { version: "quiz-policy-v1" }, submittedAt: "2026-10-09T08:10:00+08:00" },
      submittedAt: "2026-10-09T08:10:00+08:00",
    }),
  ),
  // A11 语音与报告导出的默认桩：形状对齐真实契约，story 覆盖时用 use() 换成命中/失败分支。
  http.post("/api/speech/transcribe", async ({ request }) => {
    const body = (await request.json()) as { audioBase64?: string }
    return HttpResponse.json({
      transcript: "交易下单接口的 P99 从 800ms 降到 220ms，QPS 从 600 提到 1800。",
      durationSeconds: 8.4,
      words: [
        { text: "交易下单接口的", beginMs: 0, endMs: 2400 },
        { text: "P99 从 800ms 降到 220ms，", beginMs: 2500, endMs: 5600 },
        { text: "QPS 从 600 提到 1800。", beginMs: 5700, endMs: 8400 },
      ],
      provider: "dashscope",
      receivedBytes: body.audioBase64?.length ?? 0,
    })
  }),
  http.post("/api/speech/segments", () => HttpResponse.json(MOCK_SPEECH_SEGMENT, { status: 201 })),
  http.get("/api/speech/segments", ({ request }) =>
    HttpResponse.json(
      new URL(request.url).searchParams.get("sessionId") ? [MOCK_SPEECH_SEGMENT] : [],
    ),
  ),
  http.post("/api/speech/synthesize", () =>
    HttpResponse.arrayBuffer(new Uint8Array([82, 73, 70, 70, 36, 0, 0, 0, 87, 65, 86, 69]).buffer, {
      headers: { "Content-Type": "audio/wav" },
    }),
  ),
  http.get("/api/interview/insights", ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json({
      resumeVersionId: url.searchParams.get("resumeVersionId") ?? "ver_mock",
      jdId: url.searchParams.get("jdId") ?? "jd_mock",
      matchPoints: ["简历中的订单中台项目与 JD 的分布式交易职责一致", "有高并发限流降级经验，对应 JD 的稳定性要求"],
      riskPoints: ["JD 要求 Kafka 实战经验，简历只体现为了解", "缺少 JD 强调的多活容灾落地案例"],
      scopeKeywords: ["Java 17", "Spring Cloud", "分库分表", "高并发与稳定性"],
    })
  }),
  http.get("/api/interview/sessions/:id/report/export", ({ params }) =>
    HttpResponse.text(
      "# 模拟面试评估报告\n\n- 场次：" + params.id + "\n- 量表：interview-rubric-v1\n\n（导出的 Markdown 内容由后端生成）\n",
      { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
    ),
  ),
]

