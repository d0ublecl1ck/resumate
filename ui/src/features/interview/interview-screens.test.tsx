// 五个面试数据聚合屏接真接口的行为测试（MSW 钉住契约，无需后端）。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { GrowthScreen } from "@/features/interview/growth-screen"
import { HistoryScreen } from "@/features/interview/history-screen"
import { PlanScreen } from "@/features/interview/plan-screen"
import { QuestionsScreen } from "@/features/interview/questions-screen"
import { SetupScreen } from "@/features/interview/setup-screen"
import type {
  InterviewComparison,
  InterviewGrowth,
  InterviewReportScore,
  InterviewReportView,
  InterviewSessionDetail,
  InterviewSessionSummary,
  PracticeItem,
} from "@/lib/interview"
import { server } from "@/test-server"

afterEach(cleanup)

function renderScreen(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const CALIBER = { key: "Java 后端|interview-rubric-v1", role: "Java 后端", rubricVersion: "interview-rubric-v1", sessionCount: 3 }
const GROWTH: InterviewGrowth = {
  role: null,
  primaryCaliberKey: CALIBER.key,
  totalSessions: 3,
  calibers: [CALIBER],
  series: [
    {
      caliber: CALIBER,
      averages: { correctness: 86.67, depth: 83.33, rigor: 81, fit: 88, overall: 85 },
      points: [
        { sessionId: "ivs_1", role: "Java 后端", rubricVersion: "interview-rubric-v1", correctness: 80, depth: 75, rigor: 70, fit: 86, average: 78, createdAt: "2026-10-01T09:00:00+08:00" },
        { sessionId: "ivs_2", role: "Java 后端", rubricVersion: "interview-rubric-v1", correctness: 90, depth: 87, rigor: 86, fit: 88, average: 88, createdAt: "2026-10-03T09:00:00+08:00" },
        { sessionId: "ivs_3", role: "Java 后端", rubricVersion: "interview-rubric-v1", correctness: 90, depth: 88, rigor: 87, fit: 90, average: 89, createdAt: "2026-10-05T09:00:00+08:00" },
      ],
    },
  ],
}

const ITEM: PracticeItem = {
  id: "pti_1",
  role: "Java 后端",
  dimension: "depth",
  goal: "补充分片键基因法推导",
  material: "原理深度不足",
  status: "active",
  sourceReportId: "ivr_1",
  sourceSessionId: "ivs_1",
  rubricVersion: "interview-rubric-v1",
  retestSessionId: null,
  createdAt: "2026-10-01T09:35:00+08:00",
  updatedAt: "2026-10-01T09:35:00+08:00",
}

function summary(overrides: Partial<InterviewSessionSummary>): InterviewSessionSummary {
  return {
    id: "ivs_1",
    status: "completed",
    role: "Java 后端",
    rubricVersion: "interview-rubric-v1",
    questionCount: 4,
    answeredCount: 4,
    questionKinds: { technical: 2, behavioral: 1, situational: 1 },
    resumeTitle: "后端工程师简历",
    hasReport: true,
    dimensionScores: [],
    averageScore: 78,
    createdAt: "2026-10-01T09:00:00+08:00",
    completedAt: "2026-10-01T09:30:00+08:00",
    ...overrides,
  }
}

const SCORES: InterviewReportScore[] = [
  { dimension: "correctness", score: 80, evidence: ["分片键方案完整"] },
  { dimension: "depth", score: 62, evidence: ["没有给出方案取舍"] },
  { dimension: "rigor", score: 71, evidence: ["缺少容量推导"] },
  { dimension: "fit", score: 74, evidence: ["项目未对齐 JD"] },
]

describe("GrowthScreen", () => {
  it("渲染后端返回的真实四维平均值与练习项", async () => {
    server.use(
      http.get("/api/interview/growth", () => HttpResponse.json(GROWTH)),
      http.get("/api/interview/practice-items", () => HttpResponse.json([ITEM])),
    )
    renderScreen(<GrowthScreen />)

    expect(await screen.findByText("78")).toBeInTheDocument()
    expect(screen.getByText("88")).toBeInTheDocument()
    expect(screen.getByText("89")).toBeInTheDocument()
    expect(await screen.findByText("补充分片键基因法推导")).toBeInTheDocument()
    expect(screen.getByText("共聚合 3 场真实会话；练完从同一条成长记录发起同量表复测，结果回写后续点。")).toBeInTheDocument()
  })

  it("没有可聚合场次时显示空态", async () => {
    server.use(
      http.get("/api/interview/growth", () => HttpResponse.json({ ...GROWTH, totalSessions: 0, calibers: [], series: [], primaryCaliberKey: null })),
    )
    renderScreen(<GrowthScreen />)
    expect(await screen.findByText("还没有可聚合的评估结果，先完成一场面试并生成报告。")).toBeInTheDocument()
  })
})

describe("HistoryScreen", () => {
  const sessions = [
    summary({ id: "ivs_1", averageScore: 78, createdAt: "2026-10-01T09:00:00+08:00" }),
    summary({ id: "ivs_2", averageScore: 88, createdAt: "2026-10-03T09:00:00+08:00" }),
    summary({ id: "ivs_3", averageScore: 89, createdAt: "2026-10-05T09:00:00+08:00" }),
  ]

  it("同口径返回 connectable 时展示连线趋势", async () => {
    const comparison: InterviewComparison = {
      a: { id: "ivs_1", role: "Java 后端", rubricVersion: "interview-rubric-v1", average: 78, scores: SCORES, questionCount: 4, answeredCount: 4, createdAt: "2026-10-01T09:00:00+08:00" },
      b: { id: "ivs_3", role: "Java 后端", rubricVersion: "interview-rubric-v1", average: 89, scores: SCORES, questionCount: 4, answeredCount: 4, createdAt: "2026-10-05T09:00:00+08:00" },
      connectable: true,
      sameRole: true,
      sameRubricVersion: true,
      reason: "SAME_CALIBER",
    }
    server.use(
      http.get("/api/interview/sessions", () => HttpResponse.json(sessions)),
      http.get("/api/interview/comparison", () => HttpResponse.json(comparison)),
    )
    renderScreen(<HistoryScreen />)
    expect(await screen.findByText("同口径 · 岗位与量表一致")).toBeInTheDocument()
  })

  it("不同口径展示并列柱与原因文案", async () => {
    const comparison: InterviewComparison = {
      a: { id: "ivs_1", role: "Java 后端", rubricVersion: "interview-rubric-v1", average: 78, scores: SCORES, questionCount: 4, answeredCount: 4, createdAt: "2026-10-01T09:00:00+08:00" },
      b: { id: "ivs_3", role: "Java 后端", rubricVersion: "interview-rubric-v2", average: 89, scores: SCORES, questionCount: 4, answeredCount: 4, createdAt: "2026-10-05T09:00:00+08:00" },
      connectable: false,
      sameRole: true,
      sameRubricVersion: false,
      reason: "RUBRIC_VERSION_MISMATCH",
    }
    server.use(
      http.get("/api/interview/sessions", () => HttpResponse.json(sessions)),
      http.get("/api/interview/comparison", () => HttpResponse.json(comparison)),
    )
    renderScreen(<HistoryScreen />)
    expect(await screen.findByText("不同口径 · 岗位或量表不同")).toBeInTheDocument()
    expect(screen.getByText("两次场次量表版本不同，岗位即使相同也不能连线。")).toBeInTheDocument()
  })
})

describe("PlanScreen", () => {
  const report: InterviewReportView = {
    id: "ivr_1",
    sessionId: "ivs_1",
    rubricVersion: "interview-rubric-v1",
    contentScores: SCORES,
    summary: "基础扎实。",
    highlights: [],
    gaps: ["原理深度不足"],
    suggestions: ["补充分片键基因法推导"],
    createdAt: "2026-10-01T09:30:00+08:00",
  }

  it("薄弱维度来自真实报告，加入计划后调用创建接口", async () => {
    const items: PracticeItem[] = []
    server.use(
      http.get("/api/interview/sessions", () => HttpResponse.json([summary({})])),
      http.get("/api/interview/sessions/:id/report", () => HttpResponse.json(report)),
      http.get("/api/interview/practice-items", () => HttpResponse.json(items)),
      http.post("/api/interview/practice-items", async ({ request }) => {
        const body = (await request.json()) as { dimension?: string }
        const created: PracticeItem = { ...ITEM, dimension: (body.dimension as PracticeItem["dimension"]) ?? "depth" }
        items.push(created)
        return HttpResponse.json([created], { status: 201 })
      }),
    )
    renderScreen(<PlanScreen />)

    // correctness=80 达标，不应出现；depth/rigor/fit 为薄弱维度。
    expect(await screen.findByText("得分 62 分 · 达标线 80")).toBeInTheDocument()
    expect(screen.getByText("得分 71 分 · 达标线 80")).toBeInTheDocument()
    expect(screen.getByText("得分 74 分 · 达标线 80")).toBeInTheDocument()
    expect(screen.queryByText("得分 80 分 · 达标线 80")).toBeNull()

    fireEvent.click(screen.getAllByRole("button", { name: "加入计划" })[0]!)
    await waitFor(() => expect(screen.getByDisplayValue("补充分片键基因法推导")).toBeInTheDocument())
  })
})

describe("QuestionsScreen", () => {
  const detail: InterviewSessionDetail = {
    id: "ivs_1",
    status: "active",
    role: "Java 后端",
    resumeId: "res_1",
    resumeVersionId: "ver_1",
    jdId: "jd_1",
    rubricVersion: "interview-rubric-v1",
    contextSnapshot: { role: "Java 后端", resumeTitle: "后端工程师简历", resumeVersionId: "ver_1", jdRole: "Java 后端工程师", jdCompany: "星澜科技", jdBody: "订单中台" },
    report: null,
    createdAt: "2026-10-05T09:00:00+08:00",
    updatedAt: "2026-10-05T09:00:00+08:00",
    completedAt: null,
    questions: [
      { id: "ivq_1", ordinal: 1, kind: "technical", prompt: "订单表达到瓶颈后如何做分库分表？", referencePoints: ["按三年增长推算"], parentQuestionId: null, answer: null },
    ],
  }

  it("重新生成遇 409 时展示 i18n 文案而非服务端原文", async () => {
    server.use(
      http.get("/api/interview/sessions", () => HttpResponse.json([summary({ status: "active", hasReport: false, completedAt: null })])),
      http.get("/api/interview/sessions/:id", () => HttpResponse.json(detail)),
      http.post("/api/interview/sessions/:id/regenerate", () =>
        HttpResponse.json({ code: "RUN_STATE_CONFLICT", message: "session already answered" }, { status: 409 }),
      ),
    )
    renderScreen(<QuestionsScreen />)
    await screen.findAllByText("订单表达到瓶颈后如何做分库分表？")

    fireEvent.click(screen.getByRole("button", { name: /重新生成/ }))
    expect(await screen.findByText("本场已有作答或已结束，不能重新生成题目。")).toBeInTheDocument()
    expect(screen.queryByText("session already answered")).toBeNull()
  })

  it("难度/题型筛选驱动重新生成，题目详情展示知识依据", async () => {
    const withRefs: InterviewSessionDetail = {
      ...detail,
      questions: [
        {
          id: "ivq_1",
          ordinal: 1,
          kind: "deep_dive",
          prompt: "分库分表后，跨分片的订单查询你是怎么做的？",
          referencePoints: ["分片键保证查询带上用户维度"],
          difficulty: "hard",
          knowledgeRefs: ["订单中台容量设计 · 跨分片查询"],
          parentQuestionId: null,
          answer: null,
        },
      ],
    }
    let posted: unknown = null
    server.use(
      http.get("/api/interview/sessions", () => HttpResponse.json([summary({ status: "active", hasReport: false, completedAt: null })])),
      http.get("/api/interview/sessions/:id", () => HttpResponse.json(withRefs)),
      http.post("/api/interview/sessions/:id/regenerate", async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json({ ...withRefs, questions: [{ ...withRefs.questions[0], id: "ivq_new", prompt: "重新生成后的题。" }] })
      }),
    )
    renderScreen(<QuestionsScreen />)

    // 第四类题型与知识依据都能展示（筛选 chip 与题目徽标同文案，故用 findAll）。
    expect((await screen.findAllByText("项目深挖")).length).toBeGreaterThan(0)
    expect((await screen.findAllByText("订单中台容量设计 · 跨分片查询")).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole("button", { name: "困难" }))
    fireEvent.click(screen.getByRole("button", { name: "项目深挖" }))
    fireEvent.click(screen.getByRole("button", { name: /重新生成/ }))

    await waitFor(() => expect(posted).toEqual({ kinds: ["deep_dive"], difficulty: "hard" }))
    expect((await screen.findAllByText("重新生成后的题。")).length).toBeGreaterThan(0)
  })
})

describe("SetupScreen", () => {
  it("选齐简历版本与 JD 后展示真实匹配点/风险点/岗位范围", async () => {
    server.use(
      http.get("/api/resumes", () => HttpResponse.json([
        { id: "res_1", title: "后端工程师简历", targetRole: "Java 后端", tags: [], templateId: "tpl", templateVersion: 1, currentVersionId: "ver_1", lifecycle: "active", saveState: "committed", updatedAt: "2026-10-05T09:00:00+08:00", boundByJdIds: [], document: {}, versions: [] },
      ])),
      http.get("/api/resumes/:id/versions", () => HttpResponse.json([
        { id: "ver_1", source: "manual", actorId: "user_admin", startedAt: "2026-10-05T09:00:00+08:00", committedAt: "2026-10-05T09:00:00+08:00", message: "定向版", changeCount: 1, affectedSections: [] },
      ])),
      http.get("/api/jds", () => HttpResponse.json([
        { id: "jd_1", ownerId: "user_admin", role: "Java 后端工程师", company: "星澜科技", body: "负责订单中台", tags: [], revision: 1, createdAt: "2026-10-05T09:00:00+08:00", updatedAt: "2026-10-05T09:00:00+08:00" },
      ])),
      http.get("/api/interview/insights", () => HttpResponse.json({
        resumeVersionId: "ver_1",
        jdId: "jd_1",
        matchPoints: ["简历中的订单中台项目与 JD 一致"],
        riskPoints: ["JD 要求 Kafka 实战经验，简历未体现"],
        scopeKeywords: ["Java 17", "Spring Cloud"],
      })),
    )
    renderScreen(<SetupScreen />)

    fireEvent.change(await screen.findByLabelText("简历"), { target: { value: "res_1" } })
    await waitFor(() => expect(screen.getByRole("button", { name: /定向版/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: /Java 后端工程师/ }))

    expect(await screen.findByText("简历中的订单中台项目与 JD 一致")).toBeInTheDocument()
    expect(screen.getByText("JD 要求 Kafka 实战经验，简历未体现")).toBeInTheDocument()
    expect(screen.getByText("Java 17")).toBeInTheDocument()
  })
})
