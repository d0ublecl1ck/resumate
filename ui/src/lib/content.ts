// 单一数据源常量文件。
// 所有 API 客户端函数当前都从这里取数；后续对接 FastAPI 时，
// 只需把 lib/api.ts 里的实现从「读取 content」替换为「fetch(endpoint)」，
// 数据形状与端点契约保持不变。

import type {
  AccessLogEntry,
  AgentConfig,
  CapabilityDiscovery,
  ImportPreview,
  JobDescription,
  JobMatchResult,
  MatchGap,
  ModelCatalog,
  ModelConfig,
  PersonalAccessToken,
  Profile,
  Resume,
  ResumeTemplate,
  UserPreferences,
} from "./types"

export const CURRENT_USER = { id: "user_zhang", displayName: "张沐", role: "jobseeker" as const }

// ---------------------------------------------------------------------------
// Resumes
// ---------------------------------------------------------------------------

export const RESUMES: Resume[] = [
  {
    id: "res_fe_lead",
    title: "高级前端工程师简历",
    targetRole: "高级前端工程师",
    tags: ["前端", "React", "团队负责"],
    templateId: "tpl_classic",
    templateVersion: 3,
    currentVersionId: "v_fe_5",
    lifecycle: "active",
    saveState: "uncommitted",
    updatedAt: "2026-09-20T14:32:00+08:00",
    boundByJdIds: ["jd_bytedance", "jd_meituan"],
    profileId: "profile_zhang",
    document: {
      basics: {
        fullName: "张沐",
        headline: "高级前端工程师 · 8 年 Web 应用经验",
        email: "zhangmu@example.com",
        phone: "+86 138 0000 1234",
        location: "上海",
        links: [
          { label: "GitHub", url: "https://github.com/zhangmu" },
          { label: "个人站", url: "https://zhangmu.dev" },
        ],
      },
      sections: [
        {
          id: "sec_summary",
          kind: "summary",
          title: "个人摘要",
          entries: [],
          text: "8 年前端开发经验，主导过 3 个百万级 DAU 产品的架构演进，擅长性能优化、设计系统建设与前端团队管理。",
        },
        {
          id: "sec_exp",
          kind: "experience",
          title: "职业经历",
          entries: [
            {
              id: "ent_exp_1",
              title: "高级前端工程师 · 某电商平台",
              period: "2021.03 - 至今",
              location: "上海",
              bullets: [
                "主导商详页重构，首屏 LCP 从 3.2s 降至 1.4s，转化率提升 6%。",
                "搭建团队设计系统，覆盖 40+ 业务组件，接入 6 条业务线。",
              ],
              provenance: { kind: "profile_fact", label: "来自 Profile 事实", factId: "fact_perf", detail: "已验证" },
            },
            {
              id: "ent_exp_2",
              title: "前端工程师 · 某 SaaS 公司",
              period: "2018.06 - 2021.02",
              location: "杭州",
              bullets: ["负责数据可视化模块，支撑 200+ 企业客户的实时报表。"],
              provenance: { kind: "profile_fact", label: "来自 Profile 事实", factId: "fact_saas" },
            },
          ],
        },
        {
          id: "sec_skills",
          kind: "skills",
          title: "技能",
          entries: [],
          text: "React · TypeScript · Next.js · 性能优化 · 设计系统 · Node.js",
        },
      ],
    },
    versions: [
      {
        id: "v_fe_5",
        source: "manual",
        actorId: "user_zhang",
        editSessionId: "es_88",
        startedAt: "2026-09-20T14:20:00+08:00",
        committedAt: "2026-09-20T14:22:00+08:00",
        parentVersionId: "v_fe_4",
        baseVersionId: "v_fe_4",
        message: "手动更新摘要与技能",
        changeCount: 2,
        affectedSections: ["个人摘要", "技能"],
      },
      {
        id: "v_fe_4",
        source: "agent",
        actorId: "agent_builtin",
        conversationId: "conv_12",
        userTurnId: "turn_31",
        agentRunId: "run_31",
        executionMode: "approval",
        startedAt: "2026-09-19T10:05:00+08:00",
        committedAt: "2026-09-19T10:09:00+08:00",
        parentVersionId: "v_fe_3",
        baseVersionId: "v_fe_3",
        message: "针对字节 JD 强化性能优化经历",
        changeCount: 3,
        affectedSections: ["职业经历"],
        jdId: "jd_bytedance",
        jdRevision: 2,
      },
      {
        id: "v_fe_3",
        source: "manual",
        actorId: "user_zhang",
        editSessionId: "es_70",
        startedAt: "2026-09-15T09:00:00+08:00",
        committedAt: "2026-09-15T09:12:00+08:00",
        parentVersionId: "v_fe_2",
        baseVersionId: "v_fe_2",
        message: "补充设计系统项目",
        changeCount: 1,
        affectedSections: ["职业经历"],
      },
    ],
  },
  {
    id: "res_pm_pivot",
    title: "产品经理转型简历",
    targetRole: "B 端产品经理",
    tags: ["产品", "转型"],
    templateId: "tpl_modern",
    templateVersion: 2,
    currentVersionId: "v_pm_2",
    lifecycle: "active",
    saveState: "committed",
    updatedAt: "2026-09-12T18:10:00+08:00",
    boundByJdIds: [],
    profileId: "profile_zhang",
    document: {
      basics: {
        fullName: "张沐",
        headline: "从工程走向产品",
        email: "zhangmu@example.com",
        phone: "+86 138 0000 1234",
        location: "上海",
        links: [],
      },
      sections: [
        { id: "sec_sum_pm", kind: "summary", title: "个人摘要", entries: [], text: "工程背景出身的产品从业者，关注技术可行性与用户价值的平衡。" },
      ],
    },
    versions: [
      {
        id: "v_pm_2",
        source: "manual",
        actorId: "user_zhang",
        editSessionId: "es_40",
        startedAt: "2026-09-12T18:00:00+08:00",
        committedAt: "2026-09-12T18:08:00+08:00",
        parentVersionId: "v_pm_1",
        baseVersionId: "v_pm_1",
        message: "初始化产品经理简历",
        changeCount: 5,
        affectedSections: ["个人摘要"],
      },
    ],
  },
  {
    id: "res_archived_intern",
    title: "实习生简历（旧）",
    targetRole: "前端实习生",
    tags: ["实习"],
    templateId: "tpl_classic",
    templateVersion: 1,
    currentVersionId: "v_intern_1",
    lifecycle: "archived",
    saveState: "committed",
    updatedAt: "2025-11-02T12:00:00+08:00",
    boundByJdIds: [],
    document: {
      basics: { fullName: "张沐", headline: "前端实习生", email: "zhangmu@example.com", phone: "", location: "上海", links: [] },
      sections: [],
    },
    versions: [
      {
        id: "v_intern_1",
        source: "manual",
        actorId: "user_zhang",
        startedAt: "2025-11-02T11:50:00+08:00",
        committedAt: "2025-11-02T11:58:00+08:00",
        message: "归档前最后版本",
        changeCount: 3,
        affectedSections: [],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Agent Run（当前活跃 Run，挂在 res_fe_lead 上）

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const PROFILE: Profile = {
  id: "profile_zhang",
  ownerId: "user_zhang",
  displayName: "张沐的职业事实库",
  completeness: 72,
  basics: {
    fullName: "张沐",
    headline: "高级前端工程师 · 8 年 Web 应用经验",
    email: "zhangmu@example.com",
    phone: "+86 138 0000 1234",
    location: "上海",
    links: [
      { label: "GitHub", url: "https://github.com/zhangmu" },
      { label: "个人站", url: "https://zhangmu.dev" },
    ],
  },
  facts: [
    {
      id: "fact_perf",
      type: "achievement",
      title: "商详页性能优化",
      content: "主导商详页重构，首屏 LCP 从 3.2s 降至 1.4s，转化率提升 6%。",
      tags: ["性能优化", "React"],
      source: "本人填写",
      evidence: { status: "verified", label: "季度复盘文档", downloadable: true },
      confidence: 0.92,
      verifiedAt: "2026-08-01T00:00:00+08:00",
      visibility: "resume_only",
      referencedBy: [{ resumeId: "res_fe_lead", resumeTitle: "高级前端工程师简历", versionId: "v_fe_5" }],
    },
    {
      id: "fact_mentor",
      type: "experience",
      title: "带教与团队机制",
      content: "带教 3 名初级工程师，建立组件评审与性能预算机制。",
      tags: ["团队管理"],
      source: "本人填写",
      evidence: { status: "unverified" },
      confidence: 0.6,
      visibility: "resume_only",
      referencedBy: [],
    },
    {
      id: "fact_saas",
      type: "experience",
      title: "SaaS 数据可视化",
      content: "负责数据可视化模块，支撑 200+ 企业客户的实时报表。",
      tags: ["可视化", "SaaS"],
      source: "本人填写",
      evidence: { status: "no_evidence" },
      confidence: 0.7,
      visibility: "resume_only",
      referencedBy: [{ resumeId: "res_fe_lead", resumeTitle: "高级前端工程师简历", versionId: "v_fe_4" }],
    },
    {
      id: "fact_design_system",
      type: "project",
      title: "团队设计系统",
      content: "搭建覆盖 40+ 组件的设计系统，接入 6 条业务线。",
      tags: ["设计系统"],
      source: "本人填写",
      evidence: { status: "verified", label: "内部 Storybook 链接", downloadable: false },
      confidence: 0.85,
      verifiedAt: "2026-07-15T00:00:00+08:00",
      visibility: "resume_only",
      referencedBy: [{ resumeId: "res_fe_lead", resumeTitle: "高级前端工程师简历", versionId: "v_fe_3" }],
    },
  ],
  versions: [
    { id: "pv_3", createdAt: "2026-09-01T00:00:00+08:00", message: "新增带教事实", factCount: 4 },
    { id: "pv_2", createdAt: "2026-08-01T00:00:00+08:00", message: "核实性能优化证据", factCount: 3 },
    { id: "pv_1", createdAt: "2026-07-10T00:00:00+08:00", message: "初始化事实库", factCount: 2 },
  ],
}

export const JOB_MATCHES: Record<string, { results: JobMatchResult[]; gaps: MatchGap[] }> = {
  jd_meituan: {
    results: [
      { factId: "fact_perf", factTitle: "商详页性能优化", relevance: 0.94, reason: "JD 强调 C 端性能与转化", evidenceStatus: "verified" },
      { factId: "fact_mentor", factTitle: "带教与团队机制", relevance: 0.8, reason: "JD 要求团队管理经验", evidenceStatus: "unverified" },
      { factId: "fact_design_system", factTitle: "团队设计系统", relevance: 0.55, reason: "加分项：工程规范建设", evidenceStatus: "verified" },
    ],
    gaps: [
      { requirement: "5 年以上大型 C 端经验", status: "covered", note: "由性能优化与电商经历覆盖" },
      { requirement: "团队管理经验", status: "partial", note: "带教事实尚未核实证据" },
      { requirement: "跨端（小程序）经验", status: "missing", note: "事实库暂无相关记录" },
    ],
  },
}

// ---------------------------------------------------------------------------
// JD
// ---------------------------------------------------------------------------

export const JDS: JobDescription[] = [
  {
    id: "jd_meituan",
    ownerId: "user_zhang",
    role: "高级前端工程师",
    company: "美团",
    body: "负责核心交易链路 C 端前端开发；主导性能优化与体验提升；带领 3-5 人小组，建立前端工程规范；要求 5 年以上大型 C 端经验，熟悉 React 生态与性能调优。",
    sourceUrl: "https://zhaopin.meituan.com/job/12345",
    tags: ["前端", "C 端", "团队"],
    revision: 1,
    createdAt: "2026-09-18T00:00:00+08:00",
    updatedAt: "2026-09-18T00:00:00+08:00",
    boundResumeId: "res_fe_lead",
    boundResumeAvailable: true,
  },
  {
    id: "jd_bytedance",
    ownerId: "user_zhang",
    role: "前端架构师",
    company: "字节跳动",
    body: "负责基础架构与研发效能；推动大型应用性能与稳定性建设；要求扎实的工程能力与架构经验。",
    sourceUrl: "https://jobs.bytedance.com/job/67890",
    tags: ["架构", "研发效能"],
    revision: 2,
    createdAt: "2026-09-10T00:00:00+08:00",
    updatedAt: "2026-09-16T00:00:00+08:00",
    boundResumeId: "res_fe_lead",
    boundResumeAvailable: true,
  },
  {
    id: "jd_startup",
    ownerId: "user_zhang",
    role: "全栈工程师",
    company: "某早期创业公司",
    body: "从 0 到 1 搭建产品前后端；快速迭代；要求独立负责能力。",
    tags: ["全栈", "创业"],
    revision: 1,
    createdAt: "2026-08-28T00:00:00+08:00",
    updatedAt: "2026-08-28T00:00:00+08:00",
    boundResumeId: "res_pm_pivot",
    boundResumeAvailable: false, // 绑定简历不可用示例
  },
]

// ---------------------------------------------------------------------------
// 模板
// ---------------------------------------------------------------------------

export const TEMPLATES: ResumeTemplate[] = [
  { id: "tpl_classic", name: "经典单栏", status: "published", revision: 3, referenceCount: 12, publisher: "模板团队", publishedAt: "2026-06-01T00:00:00+08:00", validationErrors: [] },
  { id: "tpl_modern", name: "现代双栏", status: "published", revision: 2, referenceCount: 5, publisher: "模板团队", publishedAt: "2026-07-01T00:00:00+08:00", validationErrors: [] },
  { id: "tpl_compact", name: "紧凑技术", status: "draft", revision: 1, referenceCount: 0, publisher: "模板团队", validationErrors: ["长简历第 2 页标题溢出", "技能标签换行未处理"] },
  { id: "tpl_legacy", name: "旧版模板", status: "retired", revision: 4, referenceCount: 3, publisher: "模板团队", retiredReason: "字体授权到期", validationErrors: [] },
]

// ---------------------------------------------------------------------------
// 设置 / Agent / 模型 / 偏好
// ---------------------------------------------------------------------------

export const AGENT_CONFIG: AgentConfig = {
  currentRunMode: "approval",
  nextRunMode: "approval",
  modeSource: "session",
  // 展开为 i18n 键（settings.agent.fullAccessScope / confirmRetainedOp），由设置页按当前语言渲染。
  fullAccessScopes: ["read_search_compare_render", "content_patch", "metadata_update_archive"],
  confirmRetainedOps: ["delete", "history_restore", "overwrite_export", "profile_to_resume", "fact_promotion"],
  budget: { maxTokens: 20000, maxTurns: 8, maxCostUsd: 0.5 },
}

export const MODEL_CONFIG: ModelConfig = {
  provider: "openai",
  endpoint: "https://api.example-llm.com/v1",
  model: "gpt-4o-mini",
  keyConfigured: true,
  lastTest: { at: "2026-09-19T20:00:00+08:00", ok: true, message: "连接成功，延迟 420ms" },
}

// 只读模型目录（契约 §17）：真实数据由后端从 models.dev 快照产出，这里仅作为前端演示 fixture。fake-allow：MODEL_CATALOG 只被 ui/src/mocks/handlers.ts 的 MSW mock 引用（生产设置页走后端 /models/catalog 快照），不是产品运行路径的伪实现。
export const MODEL_CATALOG: ModelCatalog = {
  source: "models.dev",
  // 顺序与后端白名单一致（issue 7aa58）：deepseek / openai / anthropic / zhipuai / zhipuai-coding-plan。
  // 目录外的厂商不在这个 fixture 里，由 settings-form 的「自定义」文本输入承接。
  providers: [
    {
      id: "deepseek",
      label: "DeepSeek",
      models: [{ id: "deepseek-chat", label: "DeepSeek Chat", contextWindow: 64000, maxOutputTokens: 8192, inputCostPerMillion: 0.27, outputCostPerMillion: 1.1 }],
    },
    {
      id: "openai",
      label: "OpenAI",
      models: [
        { id: "gpt-4o-mini", label: "GPT-4o mini", contextWindow: 128000, maxOutputTokens: 16384, inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
        { id: "gpt-4o", label: "GPT-4o", contextWindow: 128000, maxOutputTokens: 16384, inputCostPerMillion: 2.5, outputCostPerMillion: 10 },
      ],
    },
    {
      id: "anthropic",
      label: "Anthropic",
      models: [
        { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", contextWindow: 200000, maxOutputTokens: 8192, inputCostPerMillion: 3, outputCostPerMillion: 15 },
        { id: "claude-3-opus", label: "Claude 3 Opus", contextWindow: 200000, maxOutputTokens: 4096, inputCostPerMillion: 15, outputCostPerMillion: 75 },
      ],
    },
    {
      id: "zhipuai",
      label: "智谱 GLM",
      models: [
        { id: "glm-4.6", label: "GLM-4.6", contextWindow: 200000, maxOutputTokens: 8192, inputCostPerMillion: 0.6, outputCostPerMillion: 2.2 },
        { id: "glm-4.5-air", label: "GLM-4.5 Air", contextWindow: 128000, maxOutputTokens: 8192, inputCostPerMillion: 0.2, outputCostPerMillion: 1.1 },
      ],
    },
    {
      id: "zhipuai-coding-plan",
      label: "智谱 GLM 编程套餐",
      models: [
        { id: "glm-5.3", label: "GLM-5.3", contextWindow: 200000, maxOutputTokens: 8192, inputCostPerMillion: 0.6, outputCostPerMillion: 2.2 },
        { id: "glm-5.3-flash", label: "GLM-5.3 Flash", contextWindow: 200000, maxOutputTokens: 8192, inputCostPerMillion: 0.1, outputCostPerMillion: 0.4 },
      ],
    },
  ],
}

export const USER_PREFERENCES: UserPreferences = {
  theme: "paper",
  language: "zh-CN",
  displayName: "张沐",
  autosave: true,
  autosaveIntervalSeconds: 10,
  defaultTemplateId: "tpl_classic",
  defaultTemplateRetired: false,
  // action 为 i18n 键（settings.preferences.shortcutAction），由设置页按当前语言渲染。
  shortcuts: [
    { action: "save_flush", keys: "⌘ S" },
    { action: "send_message", keys: "⌘ ↵" },
    { action: "open_history", keys: "⌘ H" },
    { action: "accept_all_diff", keys: "⌘ ⇧ A", conflict: true },
  ],
}

// ---------------------------------------------------------------------------
// 开放接入
// ---------------------------------------------------------------------------

export const PATS: PersonalAccessToken[] = [
  {
    id: "pat_1",
    name: "本地 MCP 客户端",
    scopes: ["profile:read", "resume:write"],
    resources: ["高级前端工程师简历", "张沐的职业事实库"],
    fields: ["不含联系方式"],
    purpose: "在编辑器里生成岗位简历",
    createdAt: "2026-09-01T00:00:00+08:00",
    expiresAt: "2026-12-01T00:00:00+08:00",
    lastUsedAt: "2026-09-20T13:00:00+08:00",
    status: "active",
  },
  {
    id: "pat_2",
    name: "导出脚本",
    scopes: ["resume:read"],
    resources: ["全部简历"],
    fields: ["全部字段"],
    purpose: "定时导出 PDF",
    createdAt: "2026-06-01T00:00:00+08:00",
    expiresAt: "2026-10-01T00:00:00+08:00",
    lastUsedAt: "2026-09-10T02:00:00+08:00",
    status: "expiring",
  },
  {
    id: "pat_3",
    name: "废弃 Token",
    scopes: ["resume:write"],
    resources: ["全部简历"],
    fields: [],
    purpose: "已停用的实验客户端",
    createdAt: "2026-03-01T00:00:00+08:00",
    expiresAt: "2026-09-01T00:00:00+08:00",
    status: "revoked",
  },
]

export const ACCESS_LOGS: AccessLogEntry[] = [
  { id: "al_1", at: "2026-09-20T13:00:05+08:00", clientId: "本地 MCP 客户端", scope: "resume:write", resource: "高级前端工程师简历", purpose: "生成岗位简历", result: "allowed" },
  { id: "al_2", at: "2026-09-20T13:00:04+08:00", clientId: "本地 MCP 客户端", scope: "profile:read", resource: "张沐的职业事实库", purpose: "读取获准事实", result: "allowed" },
  { id: "al_3", at: "2026-09-19T09:12:00+08:00", clientId: "未知客户端", scope: "resume:read", resource: "产品经理转型简历", purpose: "未声明", result: "denied", errorCode: "SCOPE_INSUFFICIENT" },
  { id: "al_4", at: "2026-09-18T22:00:00+08:00", clientId: "废弃 Token", scope: "resume:write", resource: "高级前端工程师简历", purpose: "写入", result: "frozen", errorCode: "TOKEN_REVOKED" },
]

export const CAPABILITY: CapabilityDiscovery = {
  contractVersion: "v0.4",
  openapiUrl: "https://api.resumate.example/openapi.json",
  mcpUrl: "https://api.resumate.example/mcp",
  wellKnownUrl: "https://api.resumate.example/.well-known/resume-agent",
  authMethods: ["PAT (Bearer)"],
  capabilities: ["resume.crud", "resume.patch", "version.restore", "profile.match-job", "jd.bind", "export.pdf", "backup.export"],
}

// ---------------------------------------------------------------------------
// 备份导入预览示例
// ---------------------------------------------------------------------------

export const IMPORT_PREVIEW_SAMPLE: ImportPreview = {
  manifest: {
    formatVersion: "resumate-backup/1.0",
    resourceCounts: { resumes: 2, versions: 9, profiles: 1, facts: 4, jds: 3 },
    attachments: [
      { name: "季度复盘文档.pdf", downloadable: true },
      { name: "内部 Storybook 截图.png", downloadable: false },
    ],
  },
  newResources: [
    { type: "Resume", title: "高级前端工程师简历（导入）" },
    { type: "Profile", title: "张沐的职业事实库（导入）" },
    { type: "JD", title: "美团 · 高级前端工程师（导入）" },
  ],
  idMappings: [
    { originalId: "res_fe_lead", newId: "res_import_1", type: "Resume" },
    { originalId: "profile_zhang", newId: "profile_import_1", type: "Profile" },
  ],
  bindingRestores: [
    { jd: "美团 · 高级前端工程师", resume: "高级前端工程师简历（导入）", status: "mapped" },
    { jd: "创业公司 · 全栈", resume: "—", status: "unmapped" },
  ],
  missingReferences: ["事实 fact_x 引用的证据附件缺失"],
  status: "has_issues",
}
