// 岗位笔试屏：真实请求 /quiz 四个端点（MSW 钉住契约，无需后端）。
// 覆盖抽题 → 客观题判分 → 开放题评分 → 代码题静态评审 → 提交看总分的完整路径。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it } from "vitest"
import { WrittenScreen } from "@/features/interview/written-screen"
import type { QuizAnswer, QuizAttempt } from "@/lib/quiz-api"
import { server } from "@/test-server"

afterEach(cleanup)

const OBJECTIVE: QuizAttempt["questions"][number] = {
  id: "qzq_obj",
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
}

const OPEN: QuizAttempt["questions"][number] = {
  id: "qzq_open",
  group: "open",
  kind: "open",
  ordinal: 2,
  points: 20,
  prompt: "大促当天订单量突增十倍，数据库连接数逼近上限。请给出排查顺序与保护方案。",
  options: [],
  referencePoints: ["排查顺序清晰", "说明取舍依据"],
  referenceAnswer: "先限流后降级再扩容。",
  starterCode: "",
  source: { kind: "bank", label: "Web 前端 岗位题库", version: "scenario · medium" },
}

const CODE: QuizAttempt["questions"][number] = {
  id: "qzq_code",
  group: "code",
  kind: "code",
  ordinal: 3,
  points: 20,
  prompt: "实现一个固定窗口限流器。",
  options: [],
  referencePoints: ["窗口过期后重置计数"],
  referenceAnswer: "if (bucket.used >= threshold) return false",
  starterCode: "export function limit() { return true }",
  source: { kind: "seed", label: "内置示范题", version: "seed-v1" },
}

function attemptBody(): QuizAttempt {
  return {
    id: "qza_test",
    status: "in_progress",
    role: "Web 前端",
    questionTypes: ["objective", "open", "code"],
    questions: [OBJECTIVE, OPEN, CODE],
    answers: [],
    result: null,
    maxScore: 50,
    createdAt: "2026-10-09T12:00:00+08:00",
    updatedAt: "2026-10-09T12:00:00+08:00",
    submittedAt: null,
  }
}

function objectiveAnswer(): QuizAnswer {
  return {
    id: "qzn_obj",
    questionId: OBJECTIVE.id,
    questionGroup: "objective",
    questionKind: "multiple_choice",
    selectedOptionIds: ["a"],
    textAnswer: null,
    codeAnswer: null,
    awardedPoints: 10,
    maxPoints: 10,
    verdict: "correct",
    executed: null,
    feedback: {
      policy: "多选口径",
      optionAnalysis: OBJECTIVE.options.map((option) => ({
        optionId: option.id,
        correct: option.id === "a",
        chosen: option.id === "a",
        explanation: "解析 " + option.id,
      })),
    },
    createdAt: "2026-10-09T12:01:00+08:00",
    gradedAt: "2026-10-09T12:01:00+08:00",
  }
}

function openAnswer(): QuizAnswer {
  return {
    id: "qzn_open",
    questionId: OPEN.id,
    questionGroup: "open",
    questionKind: "open",
    selectedOptionIds: [],
    textAnswer: "我先用网关限流保护数据库，再按优先级降级。",
    codeAnswer: null,
    awardedPoints: 15,
    maxPoints: 20,
    verdict: "graded",
    executed: null,
    feedback: {
      dimensions: [{ dimension: "correctness", score: 80, evidence: ["我先用网关限流保护数据库"] }],
      summary: "排查顺序清楚。",
      highlights: ["先保护数据库"],
      gaps: ["缺少指标"],
      suggestions: ["补充指标"],
    },
    createdAt: "2026-10-09T12:02:00+08:00",
    gradedAt: "2026-10-09T12:02:00+08:00",
  }
}

function codeAnswer(): QuizAnswer {
  return {
    id: "qzn_code",
    questionId: CODE.id,
    questionGroup: "code",
    questionKind: "code",
    selectedOptionIds: [],
    textAnswer: null,
    codeAnswer: "export function limit() { return true }",
    awardedPoints: 10,
    maxPoints: 20,
    verdict: "graded",
    executed: false,
    feedback: {
      dimensions: [{ dimension: "correctness", score: 50, evidence: ["export function limit"] }],
      summary: "核心逻辑不完整。",
      issues: ["没有窗口重置"],
      suggestions: ["补充窗口重置"],
      executed: false,
    },
    createdAt: "2026-10-09T12:03:00+08:00",
    gradedAt: "2026-10-09T12:03:00+08:00",
  }
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/interview/written"]}>
        <WrittenScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function installHandlers() {
  server.use(
    http.post("/api/quiz/attempts", () => HttpResponse.json(attemptBody(), { status: 201 })),
    http.post("/api/quiz/attempts/:id/answers", async ({ request }) => {
      const body = (await request.json()) as {
        selectedOptionIds?: string[]
        textAnswer?: string
        codeAnswer?: string
      }
      if (body.codeAnswer !== undefined) return HttpResponse.json({ answer: codeAnswer() })
      if (body.textAnswer !== undefined) return HttpResponse.json({ answer: openAnswer() })
      return HttpResponse.json({ answer: objectiveAnswer() })
    }),
    http.post("/api/quiz/attempts/:id/submit", () => {
      const body = attemptBody()
      return HttpResponse.json({
        ...body,
        status: "submitted",
        answers: [objectiveAnswer(), openAnswer(), codeAnswer()],
        result: {
          totalScore: 35,
          maxScore: 50,
          policy: { objective: "多选口径", open: "四维评分", code: "静态评审不执行" },
          submittedAt: "2026-10-09T12:10:00+08:00",
        },
        submittedAt: "2026-10-09T12:10:00+08:00",
      })
    }),
  )
}

describe("WrittenScreen", () => {
  it("跑完抽题 → 三种题型作答判分 → 提交看总分的完整路径", async () => {
    installHandlers()
    renderScreen()

    fireEvent.change(screen.getByLabelText("岗位"), { target: { value: "Web 前端" } })
    fireEvent.click(screen.getByRole("button", { name: /开始笔试/ }))

    expect(await screen.findByText(OBJECTIVE.prompt)).toBeInTheDocument()

    // 客观题：选 A 后提交，服务端判分并返回逐项解析。
    fireEvent.click(screen.getByRole("button", { name: /分片键选订单号/ }))
    fireEvent.click(screen.getByRole("button", { name: /提交答案/ }))
    expect(await screen.findByText("本题得分")).toBeInTheDocument()
    expect(screen.getByText("10 / 10")).toBeInTheDocument()

    // 开放题：作答后提交评分，展示分项与原话证据。
    fireEvent.click(screen.getByRole("tab", { name: "开放题" }))
    fireEvent.change(screen.getByLabelText("你的作答"), {
      target: { value: "我先用网关限流保护数据库，再按业务优先级降级非核心链路。" },
    })
    fireEvent.click(screen.getByRole("button", { name: /提交并评分/ }))
    expect(await screen.findByText("评分结果")).toBeInTheDocument()
    expect(screen.getByText("正确性")).toBeInTheDocument()
    // 作答原文会同时出现在 textarea 与「证据」里，这里只要求至少渲染一处。
    expect(screen.getAllByText(/我先用网关限流保护数据库/).length).toBeGreaterThan(0)

    // 代码题：提交文本做静态评审，界面明确写出不执行代码。
    fireEvent.click(screen.getByRole("tab", { name: "代码题" }))
    fireEvent.click(screen.getByRole("button", { name: /提交评审/ }))
    // 同一句不执行代码的说明会出现在面板标题与提示框两处，允许重复。
    expect(
      (await screen.findAllByText("服务端不会执行、模拟或沙箱运行你提交的代码，只对代码文本做静态评审。")).length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText("评审结果").length).toBeGreaterThan(0)
    expect(screen.getByText("没有窗口重置")).toBeInTheDocument()

    // 统一提交：显示总成绩。
    expect(screen.getByText("已作答 3 / 3 项")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /提交笔试/ }))
    expect(await screen.findByText("笔试总成绩")).toBeInTheDocument()
    expect(screen.getByText("35 / 50")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("button", { name: /提交笔试/ })).not.toBeInTheDocument())
  })

  it("角色为空时拦截提交并给出提示", async () => {
    installHandlers()
    renderScreen()
    fireEvent.click(screen.getByRole("button", { name: /开始笔试/ }))
    expect(await screen.findByText("请先填写岗位。")).toBeInTheDocument()
  })
})
