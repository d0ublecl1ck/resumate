// 表达维度的诚实边界：无音频 -> 不适用；有真实指标 -> 显示服务端算出的值。
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { InterviewReportView } from "@/lib/interview"
import type { ExpressionSummary } from "@/lib/speech-metrics"
import { server } from "@/test-server"
import { InterviewReportScreen } from "./report-screen"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const VOICE: ExpressionSummary = {
  hasAudio: true,
  segmentCount: 1,
  durationSeconds: 60,
  charCount: 128,
  paceCharsPerMin: 128,
  clarityLevel: "good",
  clarityScore: 88,
  fillerCount: 2,
  pauseCount: 5,
}

describe("InterviewReportScreen 表达维度", () => {
  it("没有音频记录时语速与清晰度都显示不适用", () => {
    render(<InterviewReportScreen speech={null} />)

    // 语速 + 清晰度两行都是「不适用」，不回落写死数字。
    expect(screen.getAllByText("不适用").length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText("128 字/分")).not.toBeInTheDocument()
  })

  it("有真实指标时显示真实算出的语速与清晰度", () => {
    render(<InterviewReportScreen speech={VOICE} />)

    expect(screen.getByText("128 字/分")).toBeInTheDocument()
    expect(screen.getByText("良好")).toBeInTheDocument()
    expect(screen.getByText("音频实测：填充词 2 次，停顿 5 次")).toBeInTheDocument()
  })
})

const REPORT: InterviewReportView = {
  id: "ivr_1",
  sessionId: "ivs_1",
  rubricVersion: "interview-rubric-v9",
  contentScores: [
    { dimension: "correctness", score: 91, evidence: ["回答原话 A"] },
    { dimension: "depth", score: null, evidence: [] },
    { dimension: "rigor", score: 70, evidence: ["回答原话 B1", "回答原话 B2"] },
    { dimension: "fit", score: 85, evidence: ["回答原话 C"] },
  ],
  summary: "本场真实摘要。",
  highlights: ["真实亮点"],
  gaps: [],
  suggestions: ["真实建议"],
  createdAt: "2026-10-05T09:30:00+08:00",
}

describe("InterviewReportScreen 真实报告", () => {
  it("渲染真实分数与证据，证据不足的维度不给分", () => {
    render(<InterviewReportScreen report={REPORT} speech={null} />)

    // 量表版本来自报告本身，而不是组件内常量 v1.0。
    expect(screen.getAllByText(/量表版本 interview-rubric-v9/).length).toBeGreaterThan(0)
    expect(screen.getByText("本场真实摘要。")).toBeInTheDocument()
    expect(screen.getByText("91")).toBeInTheDocument()
    expect(screen.getByText("回答原话 A")).toBeInTheDocument()
    expect(screen.getByText("真实亮点")).toBeInTheDocument()
    expect(screen.getByText("真实建议")).toBeInTheDocument()
    // depth 无分数 -> 证据不足；gaps 为空 -> 暂无。
    expect(screen.getAllByText("证据不足")).toHaveLength(1)
    expect(screen.getByText("暂无")).toBeInTheDocument()
  })

  it("证据多于一条时展开可看到全部回答原话", () => {
    render(<InterviewReportScreen report={REPORT} speech={null} />)
    expect(screen.queryByText("回答原话 B2")).not.toBeInTheDocument()
    fireEvent.click(screen.getByText("逻辑严谨性").closest("li")!)
    expect(screen.getByText("回答原话 B2")).toBeInTheDocument()
  })
})

describe("InterviewReportScreen 导出报告", () => {
  it("点导出请求报告导出接口并触发下载", async () => {
    let requestPath = ""
    server.use(
      http.get("/api/interview/sessions/:id/report/export", ({ request }) => {
        const url = new URL(request.url)
        requestPath = url.pathname + url.search
        return new HttpResponse("# 面试评估报告", {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": "attachment; filename=report.md",
          },
        })
      }),
    )
    const createObjectURL = vi.fn(() => "blob:report")
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true, writable: true })
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true, writable: true })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})

    render(<InterviewReportScreen report={REPORT} speech={null} />)
    fireEvent.click(screen.getByRole("button", { name: "导出报告" }))

    expect(await screen.findByText("报告已导出为 Markdown。")).toBeInTheDocument()
    expect(requestPath).toBe("/api/interview/sessions/ivs_1/report/export?format=markdown")
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report")
  })

  it("导出失败时展示 i18n 文案，不透出服务端 message", async () => {
    server.use(
      http.get("/api/interview/sessions/:id/report/export", () =>
        HttpResponse.json(
          { code: "RESOURCE_NOT_FOUND", message: "raw-backend-report-message-should-not-leak" },
          { status: 404 },
        ),
      ),
    )
    Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:report"), configurable: true, writable: true })
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true, writable: true })

    render(<InterviewReportScreen report={REPORT} speech={null} />)
    fireEvent.click(screen.getByRole("button", { name: "导出报告" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("这场面试还没有可导出的报告，请先完成评估。")
    expect(screen.queryByText(/raw-backend-report-message-should-not-leak/)).not.toBeInTheDocument()
  })
})
