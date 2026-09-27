// Vitest 用 MSW 服务器：已对接端点由后端契约驱动，fixtures 来自 content.ts。
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { AGENT_CONFIG, JDS, MODEL_CONFIG, PROFILE, RESUMES, TEMPLATES, USER_PREFERENCES } from "@/lib/content"
import type { ProfileFact } from "@/lib/types"

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
]

export const server = setupServer(...handlers)
