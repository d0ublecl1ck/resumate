// API 客户端：严格镜像 FastAPI 公共契约端点（C-10 能力表）。
//
// 约定：每个函数对应一个真实 REST 端点，注释里写明 METHOD + path。
// 当前实现从 lib/content.ts 读取（前端演示），返回 Promise 以模拟网络。
// 对接后端时，把每个函数体从「读取 content」替换为对应的 fetch(endpoint) 即可，
// 函数签名、入参、返回类型都不变。

import {
  ACCESS_LOGS,
  AGENT_CONFIG,
  AGENT_RUNS,
  CAPABILITY,
  CURRENT_USER,
  IMPORT_PREVIEW_SAMPLE,
  JDS,
  JOB_MATCHES,
  MODEL_CONFIG,
  PATS,
  PROFILE,
  RESUMES,
  TEMPLATES,
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
  ProposedFactChange,
  ProposedBasicsChange,
  ProfileInputResult,
  ProposedJd,
  ResumeBasics,
  FactType,
  Resume,
  ResumeTemplate,
  UserPreferences,
  WorkbenchSummary,
} from "./types"

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
  let items = RESUMES.filter((r) => r.lifecycle !== "deleted")
  if (params?.lifecycle) items = items.filter((r) => r.lifecycle === params.lifecycle)
  if (params?.query) items = items.filter((r) => r.title.includes(params.query!) || r.targetRole.includes(params.query!))
  if (params?.tag) items = items.filter((r) => r.tags.includes(params.tag!))
  return resolve(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
}

/** GET /resumes/{id} */
export function getResume(id: string): Promise<Resume | undefined> {
  return resolve(RESUMES.find((r) => r.id === id))
}

/** GET /resumes/{id}/versions */
export async function listResumeVersions(id: string) {
  const r = await getResume(id)
  return r?.versions ?? []
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
  return resolve(PROFILE)
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

/** POST /profile/facts —— 用户确认后创建事实（证据默认待核实，C-07） */
export function createFact(input: ProposedFactChange): Promise<ProfileFact> {
  const fact: ProfileFact = {
    id: `fact_${Date.now().toString(36)}`,
    type: input.type,
    title: input.title,
    content: input.content,
    tags: input.tags,
    source: "对话录入",
    evidence: { status: input.evidenceStatus },
    confidence: input.evidenceStatus === "verified" ? 0.9 : 0.5,
    visibility: "resume_only",
    referencedBy: [],
  }
  return resolve(fact)
}

/** PATCH /profile/facts/{id} —— 用户确认后更新事实 */
export function updateFact(id: string, patch: Partial<ProfileFact>): Promise<ProfileFact> {
  const base = PROFILE.facts.find((f) => f.id === id)
  if (!base) throw new Error("RESOURCE_NOT_FOUND")
  return resolve({ ...structuredClone(base), ...patch })
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
export function updateBasics(patch: Partial<ResumeBasics>): Promise<ResumeBasics> {
  return resolve({ ...structuredClone(PROFILE.basics), ...patch })
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
  parsed.note = `已从截图「${fileName}」识别出以下内容（演示为示例数据）。请核对后再创建。`
  return resolve(parsed)
}

/** POST /jds —— 用户确认后创建 JD */
export function createJd(input: ProposedJd): Promise<JobDescription> {
  const now = new Date().toISOString()
  const jd: JobDescription = {
    id: `jd_${Date.now().toString(36)}`,
    ownerId: CURRENT_USER.id,
    role: input.role || "未命名岗位",
    company: input.company,
    body: input.body,
    sourceUrl: input.sourceUrl,
    tags: input.tags,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  }
  return resolve(jd)
}

// —— 启发式自然语言基本信息解析 ——
function heuristicParseBasics(raw: string, basics: ResumeBasics): ProposedBasicsChange | null {
  const text = raw.trim()
  const fields: ProposedBasicsChange["fields"] = []

  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
  if (email && /(邮箱|邮件|email|mail)/i.test(text)) {
    fields.push({ key: "email", label: "邮箱", before: basics.email, after: email[0] })
  }

  const phone = text.match(/(?:\+?86[\s-]?)?1[3-9]\d(?:[\s-]?\d){8}/)
  if (phone && /(电话|手机|号码|phone|tel|联系方式)/i.test(text)) {
    fields.push({ key: "phone", label: "电话", before: basics.phone, after: phone[0].trim() })
  }

  let city: string | undefined
  const m1 = text.match(/(?:现居|坐标|定居|位于|base(?:\s*在)?)[：: ]*([\u4e00-\u9fa5]{2,6})/i)
  const m2 = text.match(/(?:现在?在|搬到了?|搬去)\s*([\u4e00-\u9fa5]{2,4})(?:市)?(?:工作|生活|办公|定居)?/)
  if (m1) city = m1[1]
  else if (m2 && /(工作|生活|办公|定居|现在在|搬)/.test(text)) city = m2[1]
  if (city && city !== basics.location) {
    fields.push({ key: "location", label: "城市", before: basics.location, after: city })
  }

  const headline = text.match(/(?:头衔|职位 ?title|一句话(?:介绍|标语)|个人标语|slogan|title)[：: 是]*(.+)$/i)
  if (headline && headline[1]) {
    fields.push({ key: "headline", label: "头衔", before: basics.headline, after: headline[1].trim() })
  }

  const name = text.match(/(?:我(?:的名字|叫)|姓名|名字)[是叫：: ]*([\u4e00-\u9fa5]{2,4}|[A-Za-z][A-Za-z ]{1,19})/)
  if (name && name[1]) {
    fields.push({ key: "fullName", label: "姓名", before: basics.fullName, after: name[1].trim() })
  }

  if (!fields.length) return null
  return {
    fields,
    parseConfidence: Math.min(0.95, 0.6 + fields.length * 0.1),
    note: "识别为对基本信息的修改。确认后立即更新，不影响你的经历与技能条目。",
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
  if (role) extracted.push({ label: "岗位", value: role })

  let company: string | undefined
  const cm = text.match(/([\u4e00-\u9fa5A-Za-z]{2,20}?(?:集团|科技(?:有限)?公司|信息技术(?:有限)?公司|有限公司|公司))/)
  if (cm) company = cm[1]
  if (company) extracted.push({ label: "公司", value: company })

  const url = text.match(/https?:\/\/\S+/)
  const sourceUrl = url?.[0]
  if (sourceUrl) extracted.push({ label: "来源", value: sourceUrl })

  const tagRules: [string, RegExp][] = [
    ["前端", /前端|react|vue|typescript|javascript/i],
    ["后端", /后端|java|golang|\bgo\b|python|node/i],
    ["性能优化", /性能|优化|调优|lcp|首屏|加载/i],
    ["团队", /团队|带领|带教|管理|leader|负责人/i],
    ["C 端", /c ?端|用户端|海量|高并发|交易链路/i],
    ["架构", /架构|基础设施|中台|框架|工程化/i],
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
        ? "已从截图识别内容，请核对后创建。"
        : "已从粘贴文本中提取岗位、公司与标签。请核对后创建。",
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
  if (dateMatch) extracted.push({ label: "时间", value: dateMatch[0] })

  // 类型判定
  const typeRules: { type: FactType; re: RegExp; label: string }[] = [
    { type: "achievement", re: /(获奖|得奖|荣获|拿了.*奖|得了.*奖|获得.*奖|最佳|冠军|亚军|季军|第[一二三]名|荣誉|表彰|优秀员工|一等奖|二等奖|三等奖|金奖|银奖|奖学金|奖项)/, label: "成果" },
    { type: "certificate", re: /(证书|认证|考取|资格证|通过了?.*考试|等级考试|PMP|CPA|CFA)/, label: "证书" },
    { type: "education", re: /(毕业|学位|本科|硕士|博士|学士|大学|学院|GPA|专业)/, label: "教育" },
    { type: "project", re: /(项目|开发了?|搭建|重构|上线|从 ?0 ?到 ?1|主导.*系统|做了个)/, label: "项目" },
    { type: "skill", re: /(精通|熟练|掌握|会用|技能|擅长|语言|框架|工具链)/, label: "技能" },
    { type: "experience", re: /(入职|担任|负责|工作|任职|带团队|晋升|离职)/, label: "经历" },
  ]
  const matched = typeRules.find((r) => r.re.test(text))
  const type: FactType = matched?.type ?? "experience"
  extracted.push({ label: "类型", value: matched?.label ?? "经历（默认）" })

  // 标题：去掉开头的时间短语，截取首个短句
  let titleSource = text.replace(/^(在|于)?\s*20\d{2}\s*年\s*(\d{1,2}\s*月)?\s*/, "")
  const firstClause = titleSource.split(/[，,。.；;、\n]/)[0]?.trim() || titleSource
  const title = firstClause.length > 24 ? firstClause.slice(0, 24) + "…" : firstClause || "未命名事实"

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
      ? `识别为对已有事实「${target!.title}」的补充更新。确认后将合并内容，证据状态保持待核实。`
      : "识别为一条新事实��自然语言录入的内容默认为「待核实」，可在确认后上传证据再标记为已核实。",
  }
}

// ---------------------------------------------------------------------------
// JD：CRUD / search / detail / 软绑定 read|replace|release / 候选与微调
// ---------------------------------------------------------------------------

/** GET /jds */
export function listJds(params?: { query?: string; tag?: string }): Promise<JobDescription[]> {
  let items = [...JDS]
  if (params?.query) items = items.filter((j) => j.role.includes(params.query!) || (j.company ?? "").includes(params.query!))
  if (params?.tag) items = items.filter((j) => j.tags.includes(params.tag!))
  return resolve(items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
}

/** GET /jds/{id} */
export function getJd(id: string): Promise<JobDescription | undefined> {
  return resolve(JDS.find((j) => j.id === id))
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
  return resolve(TEMPLATES)
}

/** GET /templates/{id} */
export function getTemplate(id: string): Promise<ResumeTemplate | undefined> {
  return resolve(TEMPLATES.find((t) => t.id === id))
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
      { label: "建立事实库", done: true },
      { label: "生成岗位简历", done: true },
      { label: "针对性微调", done: false },
      { label: "导出投递", done: false },
    ],
  })
}

export { CURRENT_USER }
