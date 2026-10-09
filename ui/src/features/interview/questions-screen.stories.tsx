// Storybook 确认屏：题目生成。数据形状抄自真实 /interview/sessions 与 /interview/sessions/{id}。
import { http, HttpResponse } from "msw"
import type { InterviewSessionDetail, InterviewSessionSummary } from "@/lib/interview"
import { worker } from "@/mocks/browser"
import { Screen } from "@/storybook/screen"
import { QuestionsScreen } from "./questions-screen"

const SESSION: InterviewSessionSummary = {
  id: "ivs_5d13d06cd4d7",
  status: "active",
  role: "Java 后端",
  rubricVersion: "interview-rubric-v1",
  questionCount: 4,
  answeredCount: 0,
  questionKinds: { technical: 1, deep_dive: 1, scenario: 1, behavioral: 1 },
  resumeTitle: "后端工程师简历",
  hasReport: false,
  dimensionScores: [],
  averageScore: null,
  createdAt: "2026-10-05T09:00:00+08:00",
  completedAt: null,
}

const DETAIL: InterviewSessionDetail = {
  id: SESSION.id,
  status: "active",
  role: SESSION.role,
  resumeId: "res_1",
  resumeVersionId: "ver_1",
  jdId: "jd_1",
  rubricVersion: "interview-rubric-v1",
  contextSnapshot: { role: "Java 后端", resumeTitle: "后端工程师简历", resumeVersionId: "ver_1", jdRole: "Java 后端工程师", jdCompany: "星澜科技", jdBody: "负责订单中台核心服务" },
  filters: { difficulty: "hard", kinds: ["technical", "deep_dive", "scenario", "behavioral"] },
  report: null,
  createdAt: SESSION.createdAt,
  updatedAt: SESSION.createdAt,
  completedAt: null,
  questions: [
    {
      id: "ivq_1",
      ordinal: 1,
      kind: "technical",
      prompt: "订单表达到瓶颈后如何做分库分表？请说明分片键与分片数推导。",
      referencePoints: ["按三年增长推算", "分片键保证查询带上用户维度"],
      difficulty: "hard",
      knowledgeRefs: ["订单中台容量设计 · 分片键与路由"],
      parentQuestionId: null,
      answer: null,
    },
    {
      id: "ivq_2",
      ordinal: 2,
      kind: "deep_dive",
      prompt: "分库分表后，跨分片的订单查询与统计你是怎么做的？",
      referencePoints: ["还原时间线", "结论落到检查项并复查"],
      difficulty: "hard",
      knowledgeRefs: ["订单中台容量设计 · 跨分片查询"],
      parentQuestionId: null,
      answer: null,
    },
    {
      id: "ivq_3",
      ordinal: 3,
      kind: "scenario",
      prompt: "大促流量突增十倍时，你会如何保护下游数据库？",
      referencePoints: ["先看监控确认影响面", "无法定位先降级止损"],
      difficulty: "medium",
      knowledgeRefs: ["高并发稳定性设计 · 限流与降级"],
      parentQuestionId: null,
      answer: null,
    },
    {
      id: "ivq_4",
      ordinal: 4,
      kind: "behavioral",
      prompt: "讲一次你主导复盘并推动改进的经历。",
      referencePoints: ["还原时间线", "结论落到检查项并复查"],
      // 无知识库命中：刻意展示「依据不足」而不是伪造引用。
      difficulty: "easy",
      knowledgeRefs: [],
      parentQuestionId: null,
      answer: null,
    },
  ],
}

export default { title: "Interview/Questions" }

export const Default = {
  render: () => {
    worker.resetHandlers()
    worker.use(
      http.get("/api/interview/sessions", () => HttpResponse.json([SESSION])),
      http.get("/api/interview/sessions/:id", () => HttpResponse.json(DETAIL)),
    )
    return (
      <Screen path="/interview/questions" routePath="/interview/questions">
        <QuestionsScreen />
      </Screen>
    )
  },
}
