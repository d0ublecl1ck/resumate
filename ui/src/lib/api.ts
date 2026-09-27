// API 客户端：严格镜像 FastAPI 公共契约端点（C-10 能力表）。
//
// 约定：每个函数对应一个真实 REST 端点，注释里写明 METHOD + path。
// 后端已实现的端点走真实 HTTP（api-client.ts）；未实现的端点仍从 lib/content.ts
// 读取 mock，待对应后端能力落地后再替换，函数签名与入参、返回类型保持不变。

import {
  ACCESS_LOGS,
  AGENT_CONFIG,
  AGENT_RUNS,
  CAPABILITY,
  CURRENT_USER,
  IMPORT_PREVIEW_SAMPLE,
  JOB_MATCHES,
  MODEL_CONFIG,
  PATS,
  PROFILE,
  USER_PREFERENCES,
} from "./content"
import type {
  AccessLogEntry,
  AgentConfig,
  AgentRun,
  CapabilityDiscovery,
  ImportPreview,
  JobDescription,
  JobMatchResult,
  MatchGap,
  ModelConfig,
  PersonalAccessToken,
  Profile,
  ProfileFact,
  ProfileFactInput,
  ProposedFactChange,
  ProposedBasicsChange,
  ProfileInputResult,
  ProposedJd,
  ResumeBasics,
  FactType,
  Resume,
  ResumeTemplate,
  ResumeVersion,
  UserPreferences,
  WorkbenchSummary,
} from "./types"
import { request } from "./api-client"
import i18n from "@/i18n"

// 模拟网络延迟，方便页面演示 loading 状态。设为 0 可关闭。
const LATENCY = 0
function resolve<T>(data: T): Promise<T> {
  return new Promise((r) => (LATENCY ? setTimeout(() => r(structuredClone(data)), LATENCY) : r(structuredClone(data))))
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

/** GET /resumes/{id} */
export function getResume(id: string): Promise<Resume | undefined> {
  return request<Resume>(`/resumes/${id}`)
}

/** GET /resumes/{id}/versions */
export function listResumeVersions(id: string) {
  return request<ResumeVersion[]>(`/resumes/${id}/versions`)
}

// ---------------------------------------------------------------------------
// Agent Run / Conversation：events / cancel / PendingAction approve|reject
// ---------------------------------------------------------------------------

/** GET /resumes/{id}/run （SSE 在真实实现中用 EventSource） */
export function getActiveRun(resumeId: string): Promise<AgentRun | undefined> {
  return resolve(AGENT_RUNS.find((run) => run.resumeId === resumeId))
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
 * POST /profile/facts:parse
 * 把用户的自然语言输入解析为「事实变更建议」。真实实现由 Agent（LLM）完成；
 * 这里用启发式规则做前端演示。返回的是建议，调用方必须让用户显式确认后再写入。
 */
export function parseFactFromText(text: string): Promise<ProposedFactChange> {
  return resolve(heuristicParseFact(text, PROFILE.facts))
}

/** POST /profile/facts —— 用户确认对话建议后创建事实（证据默认待核实，C-07） */
export function createFact(input: ProposedFactChange): Promise<ProfileFact> {
  return request<ProfileFact>("/profile/facts", {
    method: "POST",
    body: JSON.stringify({
      type: input.type,
      title: input.title,
      content: input.content,
      tags: input.tags,
      evidence: { status: input.evidenceStatus },
    }),
  })
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

/**
 * POST /profile:parse-input
 * 统一解析 Profile 助手的自然语言输入：可能是「修改基本信息」，
 * 也可能是「新增/更新一段经历/项目/技能等」。真实实现由 Agent 完成。
 */
export function parseProfileInput(text: string): Promise<ProfileInputResult> {
  const basics = heuristicParseBasics(text, PROFILE.basics)
  if (basics) return resolve({ kind: "basics", change: basics })
  return resolve({ kind: "fact", change: heuristicParseFact(text, PROFILE.facts) })
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

// —— 启发式自然语言基本信息解析 ——
function heuristicParseBasics(raw: string, basics: ResumeBasics): ProposedBasicsChange | null {
  const text = raw.trim()
  const fields: ProposedBasicsChange["fields"] = []

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  if (email && /(邮箱|邮件|email|mail)/i.test(text)) {
    fields.push({ key: "email", label: i18n.t("api.basics.fields.email"), before: basics.email, after: email[0] })
  }

  const phone = text.match(/(?:\+?86[\s-]?)?1[3-9]\d(?:[\s-]?\d){8}/)
  if (phone && /(电话|手机|号码|phone|tel|联系方式)/i.test(text)) {
    fields.push({ key: "phone", label: i18n.t("api.basics.fields.phone"), before: basics.phone, after: phone[0].trim() })
  }

  let city: string | undefined
  const m1 = text.match(/(?:现居|坐标|定居|位于|base(?:\s*在)?)[：: ]*([\u4e00-\u9fa5]{2,6})/i)
  const m2 = text.match(/(?:现在?在|搬到了?|搬去)\s*([\u4e00-\u9fa5]{2,4})(?:市)?(?:工作|生活|办公|定居)?/)
  if (m1) city = m1[1]
  else if (m2 && /(工作|生活|办公|定居|现在在|搬)/.test(text)) city = m2[1]
  if (city && city !== basics.location) {
    fields.push({ key: "location", label: i18n.t("api.basics.fields.location"), before: basics.location, after: city })
  }

  const headline = text.match(/(?:头衔|职位 ?title|一句话(?:介绍|标语)|个人标语|slogan|title)[：: 是]*(.+)$/i)
  if (headline && headline[1]) {
    fields.push({ key: "headline", label: i18n.t("api.basics.fields.headline"), before: basics.headline, after: headline[1].trim() })
  }

  const name = text.match(/(?:我(?:的名字|叫)|姓名|名字)[是叫：: ]*([\u4e00-\u9fa5]{2,4}|[A-Za-z][A-Za-z ]{1,19})/)
  if (name && name[1]) {
    fields.push({ key: "fullName", label: i18n.t("api.basics.fields.fullName"), before: basics.fullName, after: name[1].trim() })
  }

  if (!fields.length) return null
  return {
    fields,
    parseConfidence: Math.min(0.95, 0.6 + fields.length * 0.1),
    note: i18n.t("api.basics.note"),
  }
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

// —— 启发式自然语言事实解析（仅用于前端演示，真实由 Agent 承担）——
function heuristicParseFact(
  raw: string,
  existing: { id: string; title: string; type: FactType; content: string }[],
): ProposedFactChange {
  const text = raw.trim()
  const extracted: { label: string; value: string }[] = []

  // 时间抽取
  const dateMatch =
    text.match(/(20\d{2})\s*年\s*(\d{1,2})?\s*月?/) || text.match(/(20\d{2})[-/.](\d{1,2})(?:[-/.]\d{1,2})?/)
  if (dateMatch) extracted.push({ label: i18n.t("api.fact.extracted.time"), value: dateMatch[0] })

  // 类型判定
  const typeRules: { type: FactType; re: RegExp }[] = [
    { type: "achievement", re: /(获奖|得奖|荣获|拿了.*奖|得了.*奖|获得.*奖|最佳|冠军|亚军|季军|第[一二三]名|荣誉|表彰|优秀员工|一等奖|二等奖|三等奖|金奖|银奖|奖学金|奖项)/ },
    { type: "certificate", re: /(证书|认证|考取|资格证|通过了?.*考试|等级考试|PMP|CPA|CFA)/ },
    { type: "education", re: /(毕业|学位|本科|硕士|博士|学士|大学|学院|GPA|专业)/ },
    { type: "project", re: /(项目|开发了?|搭建|重构|上线|从 ?0 ?到 ?1|主导.*系统|做了个)/ },
    { type: "skill", re: /(精通|熟练|掌握|会用|技能|擅长|语言|框架|工具链)/ },
    { type: "experience", re: /(入职|担任|负责|工作|任职|带团队|晋升|离职)/ },
  ]
  const matched = typeRules.find((r) => r.re.test(text))
  const type: FactType = matched?.type ?? "experience"
  extracted.push({
    label: i18n.t("api.fact.extracted.type"),
    value: matched ? i18n.t("api.fact.types." + matched.type) : i18n.t("api.fact.typeDefault"),
  })

  // 标题：去掉开头的时间短语，截取首个短句
  let titleSource = text.replace(/^(在|于)?\s*20\d{2}\s*年\s*(\d{1,2}\s*月)?\s*/, "")
  const firstClause = titleSource.split(/[，,。.；;、\n]/)[0]?.trim() || titleSource
  const title = firstClause.length > 24 ? firstClause.slice(0, 24) + "…" : firstClause || i18n.t("api.fact.untitled")

  // 更新判定：与现有事实标题/内容有明显 token 重合则视为更新建议
  const tokens = (title.match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g) || []).filter((t) => t.length >= 2)
  let target: (typeof existing)[number] | undefined
  let bestScore = 0
  for (const f of existing) {
    const hay = f.title + f.content
    const score = tokens.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0)
    if (score > bestScore) {
      bestScore = score
      target = f
    }
  }
  const isUpdate = !!target && bestScore >= 2

  const parseConfidence = Math.min(0.95, 0.55 + (matched ? 0.2 : 0) + (dateMatch ? 0.1 : 0) + (isUpdate ? 0.1 : 0))

  return {
    operation: isUpdate ? "update" : "create",
    targetFactId: isUpdate ? target!.id : undefined,
    targetFactTitle: isUpdate ? target!.title : undefined,
    type: isUpdate ? target!.type : type,
    title: isUpdate ? target!.title : title,
    content: text,
    tags: [],
    extracted,
    evidenceStatus: "unverified",
    parseConfidence,
    note: isUpdate
      ? i18n.t("api.fact.note.update", { title: target!.title })
      : i18n.t("api.fact.note.create"),
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
// 配置：agent/config / models / settings / execution-mode
// ---------------------------------------------------------------------------

/** GET /agent/config */
export function getAgentConfig(): Promise<AgentConfig> {
  return resolve(AGENT_CONFIG)
}

/** GET /models/config */
export function getModelConfig(): Promise<ModelConfig> {
  return resolve(MODEL_CONFIG)
}

/** GET /settings */
export function getPreferences(): Promise<UserPreferences> {
  return resolve(USER_PREFERENCES)
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
  return resolve(PATS)
}

/** GET /access/logs */
export function listAccessLogs(): Promise<AccessLogEntry[]> {
  return resolve(ACCESS_LOGS)
}

/** GET /.well-known/resume-agent */
export function getCapability(): Promise<CapabilityDiscovery> {
  return resolve(CAPABILITY)
}

// ---------------------------------------------------------------------------
// 备份迁移：export / import 预览
// ---------------------------------------------------------------------------

/** POST /backup/import:preview */
export function previewImport(): Promise<ImportPreview> {
  return resolve(IMPORT_PREVIEW_SAMPLE)
}

// ---------------------------------------------------------------------------
// 工作台聚合（SCR-001）
// ---------------------------------------------------------------------------

/** GET /workbench/summary —— 由多个资源聚合出的首页摘要 */
export async function getWorkbenchSummary(): Promise<WorkbenchSummary> {
  const resumes = await listResumes()
  const jds = await listJds()
  const profile = await getProfile()
  const runs = AGENT_RUNS
  const pendingActionCount = runs.reduce((n, run) => n + run.pendingActions.filter((p) => p.state === "pending").length, 0)
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
