// 面试会话页（容器）行为：真实取数交给三个屏渲染，作答与报告走既有接口。
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import { InterviewSessionPage } from "./interview-session"
import type { InterviewReportView, InterviewSessionDetail } from "@/lib/interview"
import { server } from "@/test-server"

afterEach(cleanup)

const ACTIVE_DETAIL: InterviewSessionDetail = {
  id: "ivs_1",
  status: "active",
  role: "Java 后端",
  resumeId: "res_1",
  resumeVersionId: "ver_1",
  jdId: "jd_1",
  rubricVersion: "interview-rubric-v1",
  contextSnapshot: {
    role: "Java 后端",
    resumeTitle: "后端工程师简历",
    resumeVersionId: "ver_1",
    jdRole: "Java 后端工程师",
    jdCompany: "星澜科技",
    jdBody: "订单中台",
  },
  report: null,
  createdAt: "2026-10-05T09:00:00+08:00",
  updatedAt: "2026-10-05T09:00:00+08:00",
  completedAt: null,
  questions: [
    {
      id: "ivq_1",
      ordinal: 1,
      kind: "technical",
      prompt: "订单表达到瓶颈后如何做分库分表？",
      referencePoints: ["按三年增长推算容量"],
      parentQuestionId: null,
      answer: { id: "iva_1", questionId: "ivq_1", content: "我们按用户维度分片。", createdAt: "2026-10-05T09:05:00+08:00" },
    },
    {
      id: "ivq_2",
      ordinal: 2,
      kind: "follow_up",
      prompt: "分片键怎么选，跨片查询怎么办？",
      referencePoints: ["跨片查询的兜底方案"],
      parentQuestionId: "ivq_1",
      answer: null,
    },
  ],
}

const REPORT: InterviewReportView = {
  id: "ivr_1",
  sessionId: "ivs_1",
  rubricVersion: "interview-rubric-v1",
  contentScores: [
    { dimension: "correctness", score: 91, evidence: ["报告里的真实证据原话"] },
    { dimension: "depth", score: null, evidence: [] },
    { dimension: "rigor", score: 70, evidence: ["另一条证据"] },
    { dimension: "fit", score: 85, evidence: ["匹配度证据"] },
  ],
  summary: "真实报告摘要。",
  highlights: ["真实亮点"],
  gaps: ["真实不足"],
  suggestions: ["真实建议"],
  createdAt: "2026-10-05T09:30:00+08:00",
}

const COMPLETED_DETAIL: InterviewSessionDetail = {
  ...ACTIVE_DETAIL,
  status: "completed",
  report: REPORT,
  completedAt: "2026-10-05T09:30:00+08:00",
  questions: ACTIVE_DETAIL.questions.map((question) => ({
    ...question,
    answer: question.answer ?? { id: "iva_2", questionId: question.id, content: "我们按业务主键哈希分片。", createdAt: "2026-10-05T09:10:00+08:00" },
  })),
}

function renderPage(path = "/interview/ivs_1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/interview/:id" element={<InterviewSessionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function baseHandlers(detail: InterviewSessionDetail) {
  server.use(
    http.get("/api/interview/sessions/:id", () => HttpResponse.json(detail)),
    http.get("/api/speech/segments", () => HttpResponse.json([])),
  )
}

describe("InterviewSessionPage 容器编排", () => {
  it("活动场次渲染 SessionScreen，文字作答提交到既有作答接口", async () => {
    const posted = vi.fn()
    baseHandlers(ACTIVE_DETAIL)
    server.use(
      http.post("/api/interview/sessions/:id/answers", async ({ request }) => {
        posted(await request.json())
        return HttpResponse.json({
          answer: { id: "iva_2", questionId: "ivq_2", content: "按业务主键哈希分片。", createdAt: "2026-10-05T09:10:00+08:00" },
          followUpQuestion: null,
        })
      }),
    )
    renderPage()

    expect(await screen.findByText("分片键怎么选，跨片查询怎么办？")).toBeInTheDocument()
    fireEvent.change(screen.getByRole("textbox", { name: "输入你的回答，或按住麦克风用语音作答" }), {
      target: { value: "按业务主键哈希分片。" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    await waitFor(() => expect(posted).toHaveBeenCalledTimes(1))
    expect(posted.mock.calls[0][0]).toMatchObject({ questionId: "ivq_2", content: "按业务主键哈希分片。" })
  })

  it("语音入口切换到 VoiceScreen", async () => {
    baseHandlers(ACTIVE_DETAIL)
    renderPage()

    await screen.findByText("分片键怎么选，跨片查询怎么办？")
    fireEvent.change(screen.getByRole("textbox", { name: "输入你的回答，或按住麦克风用语音作答" }), {
      target: { value: "先写一段回答" },
    })
    fireEvent.click(screen.getByRole("button", { name: "语音回答" }))

    // 进入 VoiceScreen：jsdom 无 MediaRecorder，按设计明确降级到手动输入文本 + 时长。
    expect(await screen.findByText("我的回答")).toBeInTheDocument()
    expect(screen.getByText(/当前浏览器不支持录音/)).toBeInTheDocument()
  })

  it("已结束场次由 InterviewReportScreen 渲染真实报告", async () => {
    baseHandlers(COMPLETED_DETAIL)
    renderPage()

    expect(await screen.findByText("91")).toBeInTheDocument()
    expect(screen.getByText("报告里的真实证据原话")).toBeInTheDocument()
    expect(screen.getByText("真实报告摘要。")).toBeInTheDocument()
  })
})
