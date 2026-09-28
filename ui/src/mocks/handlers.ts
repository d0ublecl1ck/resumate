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
import type { AuthUser, Permission, ProfileFact, Role } from "@/lib/types"

const AUTH_USER: AuthUser = {
  id: "user_test",
  email: "test@resumate.dev",
  displayName: "测试用户",
  role: "super_admin",
  roles: ["super_admin"],
  permissions: ["account:read", "account:write", "user:read", "role:read"],
  isBanned: false,
  createdAt: "2026-01-01T00:00:00+08:00",
}

const AUTH_ACCOUNTS: Record<string, string> = { "test@resumate.dev": "password123" }

// d7b99 契约：未验证邮箱登录被拒；验证令牌由 verify 端点消费。
const UNVERIFIED_EMAIL = "unverified@resumate.dev"
const VERIFICATION_TOKEN = "valid-token"

const RBAC_ROLES: Role[] = [
  { id: "role_user", code: "user", name: "普通用户", description: "", rank: 1, isSystem: true, permissions: ["resume:read"] },
  { id: "role_super_admin", code: "super_admin", name: "超级管理员", description: "", rank: 3, isSystem: true, permissions: ["resume:read", "resume:write", "role:write"] },
]

const RBAC_PERMISSIONS: Permission[] = [
  { id: "perm_resume_read", code: "resume:read", group: "resume", name: "读取简历" },
  { id: "perm_resume_write", code: "resume:write", group: "resume", name: "编辑简历" },
  { id: "perm_role_write", code: "role:write", group: "role", name: "维护角色" },
]

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
  http.post("/api/auth/verification/resend", () => HttpResponse.json({ status: "verification_sent" }, { status: 202 })),
  http.post("/api/auth/verification/verify", async ({ request }) => {
    const body = (await request.json()) as { token: string }
    if (body.token !== VERIFICATION_TOKEN) {
      return HttpResponse.json({ code: "VERIFICATION_TOKEN_INVALID", message: "验证链接无效" }, { status: 400 })
    }
    return HttpResponse.json(AUTH_USER, { headers: { "Set-Cookie": "resumate_session=mock; HttpOnly; Path=/" } })
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
    let items = RESUMES.filter((resume) => resume.lifecycle !== "deleted")
    if (lifecycle) items = items.filter((resume) => resume.lifecycle === lifecycle)
    if (query) items = items.filter((resume) => resume.title.includes(query) || resume.targetRole.includes(query))
    if (tag) items = items.filter((resume) => resume.tags.includes(tag))
    return HttpResponse.json(items)
  }),
  http.get("/api/resumes/:id", ({ params }) => {
    const resume = RESUMES.find((item) => item.id === params.id)
    return resume ? HttpResponse.json(resume) : notFound(`简历 ${params.id} 不存在`)
  }),
  http.get("/api/resumes/:id/versions", ({ params }) => {
    const resume = RESUMES.find((item) => item.id === params.id)
    return resume ? HttpResponse.json(resume.versions) : notFound(`简历 ${params.id} 不存在`)
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
  http.get("/api/access/logs", () => HttpResponse.json(ACCESS_LOGS)),
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
]

